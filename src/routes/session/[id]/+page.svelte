<script lang="ts">
import { useMutation, useQuery } from 'convex-svelte';
import { useClerkContext } from 'svelte-clerk/client';
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  deduplicateSessionRankings,
  EditIcon,
  EyeIcon,
  FlameIcon,
  HandshakeIcon,
  ShareIcon,
  SparklesIcon,
  saveDeviceSessionId,
  TastingBottleIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  uploadImageToConvex,
} from '#lib';
import { page } from '$app/state';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

const clerk = useClerkContext();
const sessionId = $derived(page.params.id as Id<'sessions'>);

$effect(() => {
  if (sessionId) {
    saveDeviceSessionId(sessionId);
  }
});

// Queries
const session = useQuery(api.sessions.get, () => ({ sessionId }));
const items = useQuery(api.items.list, () => ({ sessionId }));
const rankings = useQuery(api.rankings.listBySession, () => ({ sessionId }));
const consensus = useQuery(api.rankings.getConsensus, () => ({ sessionId }));

// Mutations
const generateUploadUrl = useMutation(api.sessions.generateUploadUrl);
const createItem = useMutation(api.items.create);
const removeItem = useMutation(api.items.remove);
const joinSession = useMutation(api.rankings.joinSession);
const savePlacement = useMutation(api.rankings.savePlacement);
const setReady = useMutation(api.rankings.setReady);
const updateSessionStatus = useMutation(api.sessions.updateStatus);
const removeParticipant = useMutation(api.rankings.removeParticipant);

const isCurrentUserHost = $derived.by(() => {
  const h = session.data?.hostId;
  if (!h) return false;
  if (h === localUserId) return true;
  if (clerk.user?.id && h === clerk.user.id) return true;
  return false;
});

// Client-side identity for testing or guest access
let localUserId = $state('');
let localUserName = $state('');
let isNameModalOpen = $state(false);
let isNameRequired = $state(false);
let tempUserName = $state('');

$effect(() => {
  if (typeof window !== 'undefined') {
    let id =
      localStorage.getItem('consensauce_client_id') || localStorage.getItem('tears_client_id');
    if (!id) {
      id = `user_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('consensauce_client_id', id);
    }
    localUserId = id;

    let storedName =
      localStorage.getItem('consensauce_user_name') || localStorage.getItem('tears_user_name');
    if (clerk.user?.fullName) {
      localUserName = clerk.user.fullName;
      if (!storedName) {
        localStorage.setItem('consensauce_user_name', clerk.user.fullName);
      }
    } else if (storedName?.trim()) {
      localUserName = storedName.trim();
    } else if (clerk.isLoaded) {
      // Unauthenticated user without a configured name: present blocking modal!
      localUserName = '';
      tempUserName = '';
      isNameRequired = true;
      isNameModalOpen = true;
    }
  }
});

// Auto-join session (reactively triggers on mount and when Clerk authentication state updates)
$effect(() => {
  if (!clerk.isLoaded) return;
  const currentUserId = clerk.user?.id || localUserId;
  const currentUserName = clerk.user?.fullName || localUserName;
  const currentUserAvatar = clerk.user?.imageUrl;

  if (sessionId && currentUserId && currentUserName) {
    joinSession({
      sessionId,
      clientUserId: clerk.user?.id || localUserId,
      anonymousUserId: localUserId,
      userName: currentUserName,
      userAvatar: currentUserAvatar,
    }).catch((err) => console.error('Join error:', err));
  }
});

// Derived deduplicated ranking list
const rankingList = $derived.by(() => {
  return deduplicateSessionRankings(rankings.data ?? [], {
    clerkUserId: clerk.user?.id,
    localUserId,
    hostId: session.data?.hostId,
  });
});

// Current user's ranking
const myRanking = $derived.by(() => {
  const clerkId = clerk.user?.id;
  return rankingList.find((r) => (clerkId && r.userId === clerkId) || r.userId === localUserId);
});

// Optimistic placement overrides: itemId -> tierId (or null for unranked)
let optimisticPlacements = $state<Record<string, string | null>>({});

// Placement map for quick lookup: itemId -> { tierId, rank }
const myPlacementMap = $derived.by(() => {
  const map = new Map<string, { tierId: string; rank: number }>();
  if (myRanking?.placements) {
    for (const p of myRanking.placements) {
      map.set(p.itemId, p);
    }
  }
  // Apply optimistic overrides immediately so UI reacts with 0ms delay
  for (const [itemId, tierId] of Object.entries(optimisticPlacements)) {
    if (tierId === null) {
      map.delete(itemId);
    } else {
      const existing = map.get(itemId);
      map.set(itemId, { tierId, rank: existing ? existing.rank : map.size });
    }
  }
  return map;
});

// Clear optimistic overrides once the server ranking reflects them
$effect(() => {
  if (myRanking && Object.keys(optimisticPlacements).length > 0) {
    const serverMap = new Map<string, string>(
      (myRanking.placements ?? []).map((p) => [p.itemId as string, p.tierId]),
    );
    let hasChanges = false;
    const next = { ...optimisticPlacements };
    for (const [itemId, optTier] of Object.entries(optimisticPlacements)) {
      const serverTier = serverMap.get(itemId) ?? null;
      if (serverTier === optTier) {
        delete next[itemId];
        hasChanges = true;
      }
    }
    if (hasChanges) {
      optimisticPlacements = next;
    }
  }
});

// Unranked items pool derived reactively
const unrankedItems = $derived.by(() => {
  const list = items.data ?? [];
  return list.filter((item) => !myPlacementMap.has(item._id));
});

// Derived stats for progress & social party bar
const totalItemCount = $derived(items.data?.length ?? 0);
const myRankedCount = $derived(myPlacementMap.size);
const myProgressPercent = $derived(
  totalItemCount > 0 ? Math.round((myRankedCount / totalItemCount) * 100) : 0,
);
const readyTastersCount = $derived(rankingList.filter((r) => r.isReady).length);
const allTastersReady = $derived(rankingList.length > 0 && rankingList.every((r) => r.isReady));

// Active tab in revealed mode ('consensus' | 'compare' | 'my')
let activeTab = $state<'consensus' | 'compare' | 'my'>('consensus');
let compareUserIndex = $state(0);

// Add Item Modal state
let isAddModalOpen = $state(false);
let isUploading = $state(false);
let uploadError = $state('');
let newItemName = $state('');
let newItemNotes = $state('');
let selectedFile = $state<File | null>(null);
let previewUrl = $state<string | null>(null);
let fileInputRef = $state<HTMLInputElement | null>(null);

// Copy feedback
let copyFeedback = $state('');

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
}

async function handleAddItem(e: SubmitEvent) {
  e.preventDefault();
  if (!selectedFile || isUploading) return;

  isUploading = true;
  uploadError = '';
  try {
    // 1. Upload photo to Convex storage
    const storageId = await uploadImageToConvex(selectedFile, async () => {
      return await generateUploadUrl({});
    });

    // 2. Insert item into database
    await createItem({
      sessionId,
      name: newItemName.trim() || `Item #${(items.data?.length ?? 0) + 1}`,
      imageStorageId: storageId as Id<'_storage'>,
      notes: newItemNotes.trim() || undefined,
      addedByName: localUserName,
    });

    // Reset modal
    selectedFile = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    newItemName = '';
    newItemNotes = '';
    isAddModalOpen = false;
  } catch (err: unknown) {
    uploadError = err instanceof Error ? err.message : 'Failed to upload photo';
  } finally {
    isUploading = false;
  }
}

async function handleMoveItem(itemId: Id<'items'>, tierId: string | null) {
  // Apply optimistic update immediately so there is zero flash or bounce
  optimisticPlacements = { ...optimisticPlacements, [itemId]: tierId };
  try {
    await savePlacement({
      sessionId,
      clientUserId: clerk.user?.id || localUserId,
      anonymousUserId: localUserId,
      itemId,
      tierId,
    });
  } catch (err) {
    console.error('Failed to move item:', err);
    // On failure, revert optimistic override
    const next = { ...optimisticPlacements };
    delete next[itemId];
    optimisticPlacements = next;
  }
}

async function handleToggleReady() {
  if (!myRanking) return;
  try {
    await setReady({
      sessionId,
      clientUserId: clerk.user?.id || localUserId,
      anonymousUserId: localUserId,
      isReady: !myRanking.isReady,
    });
  } catch (err) {
    console.error('Failed to update ready status:', err);
  }
}

async function handleToggleStatus() {
  if (!session.data) return;
  const nextStatus = session.data.status === 'ranking' ? 'revealed' : 'ranking';
  try {
    await updateSessionStatus({
      sessionId,
      status: nextStatus,
    });
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}

async function handleRemoveParticipant(targetUserId: string, targetName: string) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(
      `Are you sure you want to remove ${targetName} and their rankings from this session?`,
    );
    if (!confirmed) return;
  }
  try {
    await removeParticipant({
      sessionId,
      clientUserId: clerk.user?.id || localUserId,
      anonymousUserId: localUserId,
      targetUserId,
    });
  } catch (err: unknown) {
    console.error('Failed to remove participant:', err);
    if (typeof window !== 'undefined') {
      const msg = err instanceof Error ? err.message : 'Failed to remove participant';
      window.alert(msg);
    }
  }
}

function copyRoomLink() {
  if (typeof window !== 'undefined') {
    navigator.clipboard.writeText(window.location.href);
    copyFeedback = 'Link copied!';
    setTimeout(() => (copyFeedback = ''), 2000);
  }
}

function copyRoomCode(code: string) {
  if (typeof window !== 'undefined') {
    navigator.clipboard.writeText(code);
    copyFeedback = `Code ${code} copied!`;
    setTimeout(() => (copyFeedback = ''), 2000);
  }
}

function openNameModal() {
  tempUserName = localUserName;
  isNameRequired = false;
  isNameModalOpen = true;
}

function saveNewName() {
  const trimmed = tempUserName.trim();
  if (!trimmed) return;
  localUserName = trimmed;
  if (typeof window !== 'undefined') {
    localStorage.setItem('consensauce_user_name', trimmed);
  }
  joinSession({
    sessionId,
    clientUserId: clerk.user?.id || localUserId,
    anonymousUserId: localUserId,
    userName: trimmed,
    userAvatar: clerk.user?.imageUrl,
  }).catch((err) => console.error('Join error:', err));
  isNameModalOpen = false;
  isNameRequired = false;
}

// Item Detail Modal State
interface ItemDetailData {
  _id: Id<'items'>;
  name: string;
  imageUrl?: string;
  notes?: string;
  addedBy?: string;
  createdAt?: number;
}

let selectedDetailItem = $state<ItemDetailData | null>(null);
let lastTapOpenTime = 0;

function openItemDetail(item: ItemDetailData) {
  selectedDetailItem = item;
  lastTapOpenTime = Date.now();
}

function closeItemDetail() {
  selectedDetailItem = null;
}

function handleCardClick(e: MouseEvent, item: ItemDetailData) {
  const target = e.target as HTMLElement | null;
  if (target?.closest('button, a, input, select, textarea')) return;
  if (isTouchDragging || draggedItemId) return;
  if (Date.now() - lastTapOpenTime < 350) return;
  openItemDetail(item);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedDetailItem) {
    closeItemDetail();
  }
}

// Drag & Drop State & Touch/Pointer Engine
interface DraggedItemState {
  id: Id<'items'>;
  name: string;
  imageUrl?: string;
  notes?: string;
  originTierId: string | null;
}

let activeDrag = $state<DraggedItemState | null>(null);
let dragPointerPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });
let hoveredDropTier = $state<string | null>(null);
let isTouchDragging = $state(false);
const isUnrankedHovered = $derived(hoveredDropTier === '__unranked__');

let startPointerPos = { x: 0, y: 0 };
let currentPointerId: number | null = null;
let dragCandidate: DraggedItemState | null = null;
let dragDimensions = $state<{ width: number; height: number }>({ width: 96, height: 120 });
let dragOffset = $state<{ x: number; y: number }>({ x: 0, y: 0 });
let isMouseDevice = $state(true);

$effect(() => {
  if (typeof window !== 'undefined') {
    const isTouchOnly = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    if (isTouchOnly) {
      isMouseDevice = false;
    }
  }
});

// Smooth Auto-Scrolling during drag (Touch + Desktop)
let autoScrollRaf: number | null = null;
let autoScrollSpeed = 0;

function startAutoScroll(speed: number) {
  autoScrollSpeed = speed;
  if (autoScrollRaf !== null) return;

  function step() {
    if (autoScrollSpeed !== 0) {
      window.scrollBy({ top: autoScrollSpeed, behavior: 'instant' });
      autoScrollRaf = requestAnimationFrame(step);
    } else {
      if (autoScrollRaf !== null) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
    }
  }
  autoScrollRaf = requestAnimationFrame(step);
}

function stopAutoScroll() {
  autoScrollSpeed = 0;
  if (autoScrollRaf !== null) {
    cancelAnimationFrame(autoScrollRaf);
    autoScrollRaf = null;
  }
}

function updateAutoScroll(clientY: number) {
  if (typeof window === 'undefined') return;
  const edgeThreshold = 130;
  const maxSpeed = 22;
  const viewportHeight = window.innerHeight;

  if (clientY < edgeThreshold) {
    // Scrolling UP towards the top of page
    const intensity = Math.max(0, (edgeThreshold - clientY) / edgeThreshold);
    const speed = -Math.round(intensity * maxSpeed + 4);
    startAutoScroll(speed);
  } else if (clientY > viewportHeight - edgeThreshold) {
    // Scrolling DOWN towards the bottom of page
    const intensity = Math.max(0, (clientY - (viewportHeight - edgeThreshold)) / edgeThreshold);
    const speed = Math.round(intensity * maxSpeed + 4);
    startAutoScroll(speed);
  } else {
    stopAutoScroll();
  }
}

function handlePointerDown(e: PointerEvent, item: ItemDetailData, originTierId: string | null) {
  // Let native HTML5 drag-and-drop handle mouse events on desktop
  if (e.pointerType === 'mouse' || e.button !== 0) {
    isMouseDevice = true;
    return;
  }
  isMouseDevice = false;

  const target = e.target as HTMLElement | null;
  if (target?.closest('button, a, input, select, textarea')) return;

  const cardEl = e.currentTarget as HTMLElement | null;
  if (cardEl) {
    const rect = cardEl.getBoundingClientRect();
    dragDimensions = { width: Math.round(rect.width), height: Math.round(rect.height) };
    dragOffset = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
    try {
      cardEl.setPointerCapture(e.pointerId);
    } catch {}
  }

  startPointerPos = { x: e.clientX, y: e.clientY };
  let currentPointerPos = { x: e.clientX, y: e.clientY };
  currentPointerId = e.pointerId;
  dragCandidate = {
    id: item._id,
    name: item.name,
    imageUrl: item.imageUrl,
    notes: item.notes,
    originTierId,
  };

  // Require a 260ms long-press so users can still scroll vertically across items
  let longPressTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    isTouchDragging = true;
    activeDrag = dragCandidate;
    dragPointerPos = { x: currentPointerPos.x, y: currentPointerPos.y };
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    longPressTimer = null;
  }, 260);

  function cleanup() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (cardEl) {
      try {
        if (cardEl.hasPointerCapture(currentPointerId ?? e.pointerId)) {
          cardEl.releasePointerCapture(currentPointerId ?? e.pointerId);
        }
      } catch {}
    }
    stopAutoScroll();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('touchmove', onTouchMove);
  }

  function onTouchMove(touchEvent: TouchEvent) {
    if (isTouchDragging && touchEvent.cancelable) {
      touchEvent.preventDefault();
    }
  }

  function onPointerMove(moveEvent: PointerEvent) {
    if (moveEvent.pointerId !== currentPointerId || !dragCandidate) return;

    currentPointerPos = { x: moveEvent.clientX, y: moveEvent.clientY };
    const dx = moveEvent.clientX - startPointerPos.x;
    const dy = moveEvent.clientY - startPointerPos.y;
    const distSq = dx * dx + dy * dy;

    // If user moved > 8px before long-press activates, they are scrolling!
    if (!isTouchDragging) {
      if (distSq > 64) {
        cleanup();
      }
      return;
    }

    if (moveEvent.cancelable) {
      moveEvent.preventDefault();
    }
    dragPointerPos = { x: moveEvent.clientX, y: moveEvent.clientY };
    updateAutoScroll(moveEvent.clientY);

    const elem = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
    const dropzone = elem?.closest<HTMLElement>('[data-dropzone-tier]');
    const nextTier = dropzone ? dropzone.dataset.dropzoneTier || null : null;
    if (nextTier !== hoveredDropTier) {
      hoveredDropTier = nextTier;
      const isOrigin =
        (dragCandidate.originTierId === null && nextTier === '__unranked__') ||
        dragCandidate.originTierId === nextTier;
      if (!isOrigin && nextTier !== null && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    }
  }

  function onPointerUp(upEvent: PointerEvent) {
    if (upEvent.pointerId !== currentPointerId) return;
    const wasDragging = isTouchDragging;
    const dx = upEvent.clientX - startPointerPos.x;
    const dy = upEvent.clientY - startPointerPos.y;
    const distSq = dx * dx + dy * dy;
    cleanup();

    if (wasDragging && activeDrag && hoveredDropTier !== null) {
      const targetTier = hoveredDropTier === '__unranked__' ? null : hoveredDropTier;
      if (targetTier !== activeDrag.originTierId) {
        handleMoveItem(activeDrag.id, targetTier);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15);
        }
      }
    } else if (!wasDragging && distSq <= 64) {
      openItemDetail(item);
    }

    isTouchDragging = false;
    activeDrag = null;
    hoveredDropTier = null;
    currentPointerId = null;
    dragCandidate = null;
  }

  function onPointerCancel(cancelEvent: PointerEvent) {
    if (cancelEvent.pointerId !== currentPointerId) return;
    cleanup();
    isTouchDragging = false;
    activeDrag = null;
    hoveredDropTier = null;
    currentPointerId = null;
    dragCandidate = null;
  }

  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
}

// HTML5 Desktop Drag & Drop helpers
let draggedItemId = $state<string | null>(null);

function onDragStart(e: DragEvent, itemId: string) {
  draggedItemId = itemId;
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', itemId);
    e.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(e: DragEvent, tierId: string | null) {
  e.preventDefault();
  hoveredDropTier = tierId === null ? '__unranked__' : tierId;
  updateAutoScroll(e.clientY);
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
}

function onDragLeave(e: DragEvent) {
  const currentTarget = e.currentTarget as HTMLElement;
  const relatedTarget = e.relatedTarget as HTMLElement;
  if (!currentTarget.contains(relatedTarget)) {
    hoveredDropTier = null;
    stopAutoScroll();
  }
}

function onDropTier(e: DragEvent, tierId: string | null) {
  e.preventDefault();
  stopAutoScroll();
  const itemId = draggedItemId || e.dataTransfer?.getData('text/plain');
  if (itemId) {
    handleMoveItem(itemId as Id<'items'>, tierId);
  }
  draggedItemId = null;
  hoveredDropTier = null;
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if session.isLoading}
	<div class="py-24 text-center space-y-4">
		<div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
		<p class="text-sm text-muted-foreground">Loading tasting room...</p>
	</div>
{:else if !session.data}
	<div class="max-w-md mx-auto py-20 text-center space-y-4">
		<div class="p-8 rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive space-y-3">
			<h2 class="font-bold text-xl">Session Not Found</h2>
			<p class="text-sm">This tasting room does not exist or may have been deleted.</p>
			<a href="/" class="inline-block px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
				Return to Home
			</a>
		</div>
	</div>
{:else}
	{@const s = session.data}
	{@const itemList = items.data ?? []}
	{@const consensusData = consensus.data}

	<!-- Room Header & Control Bar -->
	<div class="space-y-4 sm:space-y-6 pb-20 sm:pb-8 max-w-full overflow-x-hidden">
		<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border/60">
			<div class="space-y-2 max-w-full">
				<div class="flex items-center gap-2.5 flex-wrap">
					<h1 class="text-xl sm:text-2xl md:text-3xl font-black tracking-tight break-words">{s.title}</h1>
					<span
						class="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5 shrink-0 {s.status === 'revealed'
							? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25'
							: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'}"
					>
						{#if s.status === 'revealed'}
							<TrophyIcon class="w-3 h-3 text-purple-500" />
							<span>Revealed</span>
						{:else}
							<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
							<span>Live Tasting</span>
						{/if}
					</span>
				</div>

				<div class="flex items-center gap-2 sm:gap-3 flex-wrap text-xs text-muted-foreground">
					<button
						type="button"
						onclick={() => copyRoomCode(s.code)}
						class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/80 hover:bg-muted text-foreground border border-border/70 font-mono font-bold text-xs transition-colors cursor-pointer shrink-0"
						title="Tap to copy room code"
					>
						<span class="text-muted-foreground font-sans font-normal">Code:</span>
						<span class="tracking-wider">{s.code}</span>
						<CopyIcon class="w-3 h-3 text-muted-foreground" />
					</button>

					<button
						type="button"
						onclick={copyRoomLink}
						class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-secondary-foreground text-xs font-semibold border border-border/70 transition-colors cursor-pointer shrink-0"
					>
						<ShareIcon class="w-3.5 h-3.5" />
						<span>Share Invite</span>
					</button>

					<button
						type="button"
						onclick={openNameModal}
						class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-foreground border border-border/70 text-xs font-medium transition-colors cursor-pointer shrink-0"
					>
						<UserIcon class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<span>Tasting as: <strong class="text-foreground max-w-[120px] sm:max-w-none truncate inline-block align-bottom">{localUserName || 'Guest'}</strong></span>
						<EditIcon class="w-2.5 h-2.5 text-muted-foreground shrink-0" />
					</button>

					{#if copyFeedback}
						<span class="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold text-[11px] animate-in fade-in duration-150 inline-flex items-center gap-1 shadow-xs">
							<CheckIcon class="w-3 h-3" />
							<span>{copyFeedback}</span>
						</span>
					{/if}
				</div>
			</div>

			<!-- Quick Actions Header Buttons -->
			<div class="flex items-center gap-2 sm:gap-2.5 flex-wrap">
				<button
					onclick={() => (isAddModalOpen = true)}
					class="px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs sm:text-sm shadow-sm shadow-rose-500/15 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
				>
					<CameraIcon class="w-4 h-4" />
					<span>Add Item</span>
				</button>

				{#if s.status === 'ranking'}
					<button
						onclick={handleToggleReady}
						class="px-3.5 sm:px-4 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 {myRanking?.isReady
							? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
							: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border'}"
					>
						{#if myRanking?.isReady}
							<CheckIcon class="w-3.5 h-3.5 text-emerald-500" />
							<span>Ready (Tap to edit)</span>
						{:else}
							<span>Mark as Ready ({myRankedCount}/{totalItemCount})</span>
						{/if}
					</button>
				{/if}

				<button
					onclick={handleToggleStatus}
					class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 {s.status === 'ranking'
						? allTastersReady
							? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/30 ring-2 ring-purple-400/50 animate-pulse'
							: 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-600/20'
						: 'bg-muted hover:bg-muted/80 text-foreground border border-border'}"
				>
					{#if s.status === 'ranking'}
						<EyeIcon class="w-4 h-4" />
						<span>{allTastersReady ? 'Everyone Ready! Reveal Consensus' : 'Reveal Consensus'}</span>
					{:else}
						<span>← Back to Ranking</span>
					{/if}
				</button>
			</div>
		</div>

		<!-- Party Live Tasting & Readiness Progress (Ranking Mode) -->
		{#if s.status === 'ranking'}
			<div class="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs p-3.5 sm:p-4 space-y-3 shadow-xs max-w-full overflow-hidden">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tasting Progress</span>
							<span class="text-xs font-bold text-foreground">
								{myRankedCount} of {totalItemCount} items ranked ({myProgressPercent}%)
							</span>
						</div>
						<!-- Visual Progress Bar -->
						<div class="w-full sm:w-64 h-2 rounded-full bg-muted overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-amber-500 to-emerald-500"
								style="width: {myProgressPercent}%;"
							></div>
						</div>
					</div>

					<div class="flex items-center gap-2 text-xs">
						<span class="text-muted-foreground">Tasters:</span>
						<span class="font-bold text-foreground">
							{readyTastersCount} of {rankingList.length} ready
						</span>
					</div>
				</div>

				<!-- Tasters Status Pills -->
				<div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs max-w-full">
					{#each rankingList as r (r._id)}
						{@const isSelf = (clerk.user?.id && r.userId === clerk.user.id) || r.userId === localUserId}
						{@const isTasterHost = session.data?.hostId === r.userId}
						{@const rPlacedCount = r.placements?.length ?? 0}
						<div
							class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold shrink-0 {r.isReady
								? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
								: 'bg-muted/60 text-muted-foreground border-border/50'}"
						>
							<span class="w-2 h-2 rounded-full {r.isReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}"></span>
							<span>{r.userName}{isSelf ? ' (You)' : ''}</span>
							{#if isTasterHost}
								<span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-md leading-none">Host</span>
							{/if}
							<span class="text-[10px] opacity-75">({rPlacedCount}/{totalItemCount})</span>
							{#if r.isReady}
								<CheckIcon class="w-3 h-3 text-emerald-500" />
							{/if}
							{#if isCurrentUserHost && !isSelf && !isTasterHost}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										handleRemoveParticipant(r.userId, r.userName);
									}}
									class="p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors ml-0.5 cursor-pointer"
									title="Remove {r.userName} from session"
									aria-label="Remove {r.userName}"
								>
									<CloseIcon class="w-3 h-3" />
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ============================================== -->
		<!-- MODE 1: RANKING VIEW (Private Drag & Drop / Tap) -->
		<!-- ============================================== -->
		{#if s.status === 'ranking'}
			<div class="space-y-6">
				<!-- Tier Rows -->
				<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
					{#each s.tiers as tier (tier.id)}
						{@const placedHere = itemList.filter((item) => myPlacementMap.get(item._id)?.tierId === tier.id)}
						{@const isTierHovered = hoveredDropTier === tier.id}
						<div
							class="flex flex-row items-stretch min-h-[84px] sm:min-h-[104px] transition-colors duration-150 {isTierHovered
								? 'bg-accent/25'
								: 'hover:bg-muted/5'}"
							data-dropzone-tier={tier.id}
							ondragover={(e) => onDragOver(e, tier.id)}
							ondragleave={onDragLeave}
							ondrop={(e) => onDropTier(e, tier.id)}
							role="region"
							aria-label={`Tier ${tier.name}`}
							style={isTierHovered
								? `box-shadow: inset 0 0 0 2px ${tier.color}; background-color: ${tier.color}15;`
								: ''}
						>
							<!-- Tier Label Badge (compact on mobile, classic layout) -->
							<div
								class="w-14 sm:w-24 shrink-0 flex items-center justify-center p-2 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
								style="background-color: {tier.color};"
							>
								{tier.name}
							</div>

							<!-- Tier Item Dropzone -->
							<div
								role="list"
								aria-label="{tier.name} tier items"
								class="flex-1 p-2 sm:p-3 flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/10 min-h-[76px]"
							>
								<!-- Dashed Outline Drop Target Indicator when dragged over -->
								{#if isTierHovered && (activeDrag || draggedItemId)}
									<div
										class="h-20 sm:h-24 w-20 sm:w-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 font-bold text-[10px] sm:text-xs shrink-0 select-none shadow-inner"
										style="border-color: {tier.color}; color: {tier.color}; background-color: {tier.color}18;"
									>
										<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<path d="M12 5v14"/>
											<path d="m19 12-7 7-7-7"/>
										</svg>
										<span>Drop {tier.name}</span>
									</div>
								{/if}

								{#if placedHere.length === 0 && (!isTierHovered || (!activeDrag && !draggedItemId))}
									<span class="text-[11px] sm:text-xs italic px-2 select-none text-muted-foreground/50">
										Drag items into {tier.name}
									</span>
								{/if}

								{#each placedHere as item (item._id)}
									{@const isBeingDragged = activeDrag?.id === item._id}
									<!-- Placed Item Card (Full-bleed photo, gradient caption, no tacked-on box) -->
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
									<div
										role="listitem"
										draggable={isMouseDevice}
										onclick={(e) => handleCardClick(e, item)}
										oncontextmenu={(e) => e.preventDefault()}
										onpointerdown={(e) => handlePointerDown(e, item, tier.id)}
										ondragstart={(e) => onDragStart(e, item._id)}
										class="group relative w-20 sm:w-24 aspect-[4/5] rounded-2xl overflow-hidden shadow-md select-none shrink-0 transition-all duration-150 cursor-pointer active:cursor-grabbing bg-zinc-900 {isBeingDragged
											? 'border-2 border-dashed border-primary/70 opacity-40 scale-95 ring-2 ring-primary/30'
											: 'border border-white/20 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5 opacity-100 hover:scale-[1.02] hover:shadow-lg hover:border-white/40'}"
										style="touch-action: pan-y; -webkit-touch-callout: none; -webkit-user-select: none;"
									>
											<!-- Full-Bleed Image Background -->
											{#if item.imageUrl}
												<img
													src={item.imageUrl}
													alt={item.name}
													draggable="false"
													class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
													style="-webkit-touch-callout: none; -webkit-user-drag: none;"
												/>
											{:else}
												<div class="absolute inset-0 bg-muted flex items-center justify-center text-xs text-muted-foreground select-none pointer-events-none">
													No Photo
												</div>
											{/if}

											<!-- Dark Gradient Scrim: Integrated lighting for permanent contrast in both dark/light modes -->
											<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none"></div>

											<!-- Discreet Quick Unrank Button (top-left, thumb-friendly tap target) -->
											<button
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													handleMoveItem(item._id, null);
												}}
												class="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-destructive active:scale-90 text-white flex items-center justify-center text-xs font-bold backdrop-blur-md border border-white/25 transition-all shadow-xs cursor-pointer z-10 opacity-80 group-hover:opacity-100"
												title="Return to unranked pool"
												aria-label="Return {item.name} to unranked pool"
											>
												<CloseIcon class="w-3 h-3 text-white" />
											</button>

											<!-- Drag Grip Handle Indicator (top-right) -->
											<div class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-white/80 text-[8px] font-mono leading-none pointer-events-none border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity z-10">
												⋮⋮
											</div>

											<!-- Integrated Bottom Caption (Never squared off, 2 lines of text) -->
											<div class="absolute bottom-0 inset-x-0 p-1.5 pb-2 pointer-events-none">
												<p class="text-[10px] sm:text-[11px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">
													{item.name}
												</p>
											</div>
										</div>
									{/each}
							</div>
						</div>
					{/each}
				</div>

				<!-- Unranked Items Pool -->
				<div
					class="rounded-2xl border bg-card p-4 sm:p-5 space-y-3 transition-colors duration-150 {isUnrankedHovered
						? 'border-primary ring-2 ring-primary/40 bg-primary/5'
						: 'border-border/80'}"
					data-dropzone-tier="__unranked__"
					ondragover={(e) => onDragOver(e, null)}
					ondragleave={onDragLeave}
					ondrop={(e) => onDropTier(e, null)}
					role="region"
					aria-label="Unranked items pool"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<h3 class="font-bold text-sm sm:text-base text-foreground">
								Unranked Tasting Items
							</h3>
							<span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
								{unrankedItems.length}
							</span>
						</div>
						<p class="text-xs text-muted-foreground hidden sm:block">
							Tap tier buttons or drag onto the board above
						</p>
					</div>

					<!-- Dashed Outline Drop to Unrank Feedback Indicator -->
					{#if isUnrankedHovered && ((activeDrag && activeDrag.originTierId !== null) || (draggedItemId && myPlacementMap.get(draggedItemId as Id<'items'>)))}
						<div class="p-3 border-2 border-dashed border-primary/60 bg-primary/10 rounded-xl text-center flex items-center justify-center gap-2 text-xs font-bold text-primary shadow-xs">
							<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<polyline points="9 14 4 9 9 4"/>
								<path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
							</svg>
							<span>Release to return item to unranked pool</span>
						</div>
					{/if}

					{#if unrankedItems.length === 0}
						<div class="p-6 sm:p-8 border border-dashed border-border/70 rounded-xl text-center space-y-2 bg-muted/10">
							<p class="text-sm font-bold text-foreground inline-flex items-center justify-center gap-1.5">
								<CheckIcon class="w-4 h-4 text-emerald-500" />
								<span>All items ranked!</span>
							</p>
							<p class="text-xs text-muted-foreground">
								Tap "Mark as Ready" above when you're satisfied with your tiers.
							</p>
						</div>
					{:else}
						<div
							role="list"
							aria-label="Unranked items list"
							class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3"
						>
							{#each unrankedItems as item (item._id)}
								{@const isBeingDragged = activeDrag?.id === item._id}
								<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
								<div
									role="listitem"
									draggable={isMouseDevice}
									onclick={(e) => handleCardClick(e, item)}
									oncontextmenu={(e) => e.preventDefault()}
									onpointerdown={(e) => handlePointerDown(e, item, null)}
									ondragstart={(e) => onDragStart(e, item._id)}
									class="group relative rounded-2xl bg-card overflow-hidden shadow-sm hover:shadow-md select-none shrink-0 transition-all duration-150 cursor-pointer active:cursor-grabbing flex flex-col justify-between {isBeingDragged
										? 'border-2 border-dashed border-primary/70 opacity-40 scale-95 ring-2 ring-primary/30'
										: 'border border-border/80 opacity-100 hover:border-primary/50'}"
									style="touch-action: pan-y; -webkit-touch-callout: none; -webkit-user-select: none;"
								>
									<!-- Media Top with Integrated Gradient Caption -->
									<div class="relative aspect-[4/3] w-full bg-muted overflow-hidden">
										{#if item.imageUrl}
											<img
												src={item.imageUrl}
												alt={item.name}
												draggable="false"
												class="w-full h-full object-cover pointer-events-none select-none"
												style="-webkit-touch-callout: none; -webkit-user-drag: none;"
											/>
										{:else}
											<div class="w-full h-full flex items-center justify-center text-xs text-muted-foreground select-none pointer-events-none">
												No Photo
											</div>
										{/if}

										<!-- Subtle Drag Indicator -->
										<div class="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[9px] font-mono leading-none border border-white/10 pointer-events-none">
											⋮⋮ Drag
										</div>

										<!-- Gradient Overlay Scrim with Item Name & Notes -->
										<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none flex flex-col justify-end p-2.5">
											<p class="text-xs sm:text-sm font-bold text-white line-clamp-1 drop-shadow-sm">{item.name}</p>
											{#if item.notes}
												<p class="text-[10px] text-white/80 line-clamp-1 font-medium mt-0.5">{item.notes}</p>
											{/if}
										</div>
									</div>

									<!-- Thumb-Friendly 2x3 Tier Tap Grid (Chunky 38px touch targets!) -->
									<div class="p-1.5 bg-muted/40 dark:bg-zinc-900/50 border-t border-border/40 grid grid-cols-3 gap-1.5">
										{#each s.tiers as t (t.id)}
											<button
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													handleMoveItem(item._id, t.id);
												}}
												class="h-9 sm:h-9.5 rounded-xl text-xs font-black text-white flex items-center justify-center active:scale-95 transition-all shadow-xs cursor-pointer border border-white/10 hover:brightness-110"
												style="background-color: {t.color};"
												title="Move to {t.name}"
												aria-label="Move {item.name} to {t.name} tier"
											>
												{t.name}
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Mobile Floating Quick Jump / Ready Pill -->
				{#if unrankedItems.length > 0}
					<div class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 sm:hidden">
						<button
							type="button"
							onclick={() => {
								document.querySelector('[data-dropzone-tier="__unranked__"]')?.scrollIntoView({ behavior: 'smooth' });
							}}
							class="px-4 py-2 rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-lg shadow-primary/25 border border-primary-foreground/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M12 5v14"/>
								<path d="m19 12-7 7-7-7"/>
							</svg>
							<span>{unrankedItems.length} {unrankedItems.length === 1 ? 'item' : 'items'} to rank</span>
						</button>
					</div>
				{:else if !myRanking?.isReady && totalItemCount > 0}
					<div class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 sm:hidden">
						<button
							type="button"
							onclick={handleToggleReady}
							class="px-4 py-2 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 border border-white/20 flex items-center gap-1.5 cursor-pointer active:scale-95 animate-bounce"
						>
							<CheckIcon class="w-3.5 h-3.5 text-white" />
							<span>All ranked! Mark as Ready</span>
						</button>
					</div>
				{/if}

				<!-- Floating Drag Avatar for Touch / Pointer Gesture -->
				{#if isTouchDragging && activeDrag}
					<div
						class="fixed top-0 left-0 pointer-events-none z-[9999] select-none will-change-transform"
						style="transform: translate3d({dragPointerPos.x - dragOffset.x}px, {dragPointerPos.y - dragOffset.y}px, 0) scale(1.04); transform-origin: {dragOffset.x}px {dragOffset.y}px;"
					>
						<div
							class="rounded-2xl border-2 border-primary/80 bg-zinc-900 shadow-2xl shadow-black/70 overflow-hidden relative"
							style="width: {dragDimensions.width}px; height: {dragDimensions.height}px;"
						>
							{#if activeDrag.imageUrl}
								<img
									src={activeDrag.imageUrl}
									alt={activeDrag.name}
									class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
								/>
							{:else}
								<div class="absolute inset-0 bg-muted flex items-center justify-center select-none">
									<TastingBottleIcon class="w-8 h-8 text-muted-foreground/60" />
								</div>
							{/if}
							<div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none"></div>
							<div class="absolute bottom-0 inset-x-0 p-2.5 pointer-events-none">
								<p class="text-xs sm:text-sm font-bold text-white line-clamp-1 leading-tight drop-shadow-sm">{activeDrag.name}</p>
								{#if activeDrag.notes}
									<p class="text-[10px] text-white/80 line-clamp-1 font-medium mt-0.5">{activeDrag.notes}</p>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- ============================================== -->
		<!-- MODE 2: REVEALED CONSENSUS VIEW & DEBATES      -->
		<!-- ============================================== -->
		{#if s.status === 'revealed'}
			<div class="space-y-6">
				<!-- Tab Navigation -->
				<div class="flex items-center gap-2 border-b border-border/60 pb-2 overflow-x-auto">
					<button
						onclick={() => (activeTab = 'consensus')}
						class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 {activeTab === 'consensus'
							? 'bg-purple-600 text-white shadow-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					>
						<TrophyIcon class="w-4 h-4" />
						<span>Consensus Tier List</span>
					</button>
					<button
						onclick={() => (activeTab = 'compare')}
						class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 {activeTab === 'compare'
							? 'bg-purple-600 text-white shadow-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					>
						<UsersIcon class="w-4 h-4" />
						<span>Compare Tasters</span>
					</button>
					<button
						onclick={() => (activeTab = 'my')}
						class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 {activeTab === 'my'
							? 'bg-purple-600 text-white shadow-sm'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					>
						<UserIcon class="w-4 h-4" />
						<span>My Board</span>
					</button>
				</div>

				<!-- Highlights (Spiciest Debate & Mind Meld) -->
				{#if consensusData && (consensusData.spiciest || consensusData.mindMeld)}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<!-- Spiciest Debate -->
						{#if consensusData.spiciest}
							{@const spicy = consensusData.spiciest}
							<div class="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5 flex items-center gap-4 relative overflow-hidden">
								<div class="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted border border-rose-500/20 select-none">
									{#if spicy.imageUrl}
										<img src={spicy.imageUrl} alt={spicy.name} draggable="false" class="w-full h-full object-cover pointer-events-none select-none" style="-webkit-touch-callout: none; -webkit-user-drag: none;" />
									{/if}
								</div>
								<div class="space-y-1 min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-500 text-white uppercase tracking-wider inline-flex items-center gap-1 shadow-xs">
											<FlameIcon class="w-3.5 h-3.5 fill-white" />
											<span>Spiciest Debate</span>
										</span>
									</div>
									<h4 class="font-bold text-sm sm:text-base text-foreground truncate">{spicy.name}</h4>
									<div class="flex flex-wrap gap-1.5 text-xs pt-1">
										{#each spicy.scores as score}
											{@const voterTier = s.tiers.find((t) => t.id === score.tierId)}
											<span class="inline-flex items-center gap-1 font-semibold text-foreground px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-[11px]">
												<span>{score.userName}:</span>
												<span
													class="px-1.5 py-0.2 rounded text-[10px] font-black text-white"
													style="background-color: {voterTier?.color ?? '#888'};"
												>
													{score.tierId}
												</span>
											</span>
										{/each}
									</div>
								</div>
							</div>
						{/if}

						<!-- Mind Meld -->
						{#if consensusData.mindMeld}
							{@const mm = consensusData.mindMeld}
							<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex items-center gap-4 relative overflow-hidden">
								<div class="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted border border-emerald-500/20 select-none">
									{#if mm.imageUrl}
										<img src={mm.imageUrl} alt={mm.name} draggable="false" class="w-full h-full object-cover pointer-events-none select-none" style="-webkit-touch-callout: none; -webkit-user-drag: none;" />
									{/if}
								</div>
								<div class="space-y-1 min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-white uppercase tracking-wider inline-flex items-center gap-1 shadow-xs">
											<HandshakeIcon class="w-3.5 h-3.5" />
											<span>Mind Meld</span>
										</span>
									</div>
									<h4 class="font-bold text-sm sm:text-base text-foreground truncate">{mm.name}</h4>
									<div class="text-xs text-muted-foreground pt-0.5">
										Unanimous agreement: <strong class="text-emerald-500">{mm.consensusTierName ?? ''} Tier</strong> across all tasters!
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- TAB 1: Consensus Tier List -->
				{#if activeTab === 'consensus'}
					<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
						{#each s.tiers as tier (tier.id)}
							{@const itemsInTier = (consensusData?.consensusItems ?? []).filter(
								(item) => item.consensusTierId === tier.id
							)}
							<div class="flex flex-row items-stretch min-h-[84px] sm:min-h-[96px]">
								<!-- Tier Label -->
								<div
									class="w-14 sm:w-24 shrink-0 flex items-center justify-center p-2 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
									style="background-color: {tier.color};"
								>
									{tier.name}
								</div>

								<!-- Tier Items -->
								<div class="flex-1 p-2 sm:p-3 flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/10 min-h-[70px]">
									{#if itemsInTier.length === 0}
										<span class="text-xs text-muted-foreground/40 italic px-2">No consensus items</span>
									{:else}
										{#each itemsInTier as item (item._id)}
											<div
												role="button"
												tabindex="0"
												onclick={() => openItemDetail(item)}
												onkeydown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') openItemDetail(item);
												}}
												class="group relative w-20 sm:w-24 aspect-[4/5] rounded-2xl overflow-hidden shadow-md border border-white/20 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5 bg-zinc-900 shrink-0 cursor-pointer hover:scale-[1.03] transition-all"
											>
												{#if item.imageUrl}
													<img src={item.imageUrl} alt={item.name} draggable="false" class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" style="-webkit-touch-callout: none; -webkit-user-drag: none;" />
												{:else}
													<div class="absolute inset-0 bg-muted flex items-center justify-center text-xs text-muted-foreground select-none">
														No Photo
													</div>
												{/if}
												<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none"></div>
												<div class="absolute bottom-0 inset-x-0 p-1.5 pb-2 pointer-events-none space-y-1">
													<p class="text-[10px] sm:text-[11px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">{item.name}</p>
													<div class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[9px] font-bold text-white border border-white/20">
														Score: {item.averageScore.toFixed(1)}
													</div>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- TAB 2: Compare All Tasters -->
				{#if activeTab === 'compare'}
					<div class="space-y-4">
						<div class="flex items-center gap-2 overflow-x-auto pb-2">
							{#each rankingList as r, idx (r._id)}
								{@const isTasterSelf = (clerk.user?.id && r.userId === clerk.user.id) || r.userId === localUserId}
								{@const isTasterHost = session.data?.hostId === r.userId}
								<div class="inline-flex items-center rounded-xl shrink-0 {compareUserIndex === idx
									? 'bg-primary text-primary-foreground shadow-sm'
									: 'bg-muted text-muted-foreground hover:text-foreground'}">
									<button
										onclick={() => (compareUserIndex = idx)}
										class="px-3.5 py-2 text-xs font-bold transition-all cursor-pointer"
									>
										{r.userName}'s Board
									</button>
									{#if isCurrentUserHost && !isTasterSelf && !isTasterHost}
										<button
											type="button"
											onclick={() => handleRemoveParticipant(r.userId, r.userName)}
											class="p-1.5 mr-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-destructive/20 text-destructive transition-colors cursor-pointer"
											title="Remove {r.userName}"
										>
											<CloseIcon class="w-3 h-3" />
										</button>
									{/if}
								</div>
							{/each}
						</div>

						{#if rankingList[compareUserIndex]}
							{@const targetRanking = rankingList[compareUserIndex]}
							{@const targetPlacements = new Map(targetRanking.placements.map((p) => [p.itemId, p.tierId]))}
							<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
								{#each s.tiers as tier (tier.id)}
									{@const placed = itemList.filter((item) => targetPlacements.get(item._id) === tier.id)}
									<div class="flex flex-row items-stretch min-h-[84px] sm:min-h-[96px]">
										<div
											class="w-14 sm:w-24 shrink-0 flex items-center justify-center p-2 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
											style="background-color: {tier.color};"
										>
											{tier.name}
										</div>
										<div class="flex-1 p-2 sm:p-3 flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/10 min-h-[70px]">
											{#if placed.length === 0}
												<span class="text-xs text-muted-foreground/40 italic px-2">No items</span>
											{:else}
												{#each placed as item (item._id)}
													<div class="group relative w-20 sm:w-24 aspect-[4/5] rounded-2xl overflow-hidden shadow-md border border-white/20 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5 bg-zinc-900 shrink-0">
														{#if item.imageUrl}
															<img src={item.imageUrl} alt={item.name} draggable="false" class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" style="-webkit-touch-callout: none; -webkit-user-drag: none;" />
														{:else}
															<div class="absolute inset-0 bg-muted flex items-center justify-center text-xs text-muted-foreground select-none">
																No Photo
															</div>
														{/if}
														<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none"></div>
														<div class="absolute bottom-0 inset-x-0 p-1.5 pb-2 pointer-events-none">
															<p class="text-[10px] sm:text-[11px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">{item.name}</p>
														</div>
													</div>
												{/each}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- TAB 3: My Individual Board -->
				{#if activeTab === 'my'}
					<div class="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm divide-y divide-border/60">
						{#each s.tiers as tier (tier.id)}
							{@const placed = itemList.filter((item) => myPlacementMap.get(item._id)?.tierId === tier.id)}
							<div class="flex flex-row items-stretch min-h-[84px] sm:min-h-[96px]">
								<div
									class="w-14 sm:w-24 shrink-0 flex items-center justify-center p-2 sm:p-4 font-black text-2xl sm:text-3xl text-white select-none shadow-inner"
									style="background-color: {tier.color};"
								>
									{tier.name}
								</div>
								<div class="flex-1 p-2 sm:p-3 flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/10 min-h-[70px]">
									{#if placed.length === 0}
										<span class="text-xs text-muted-foreground/40 italic px-2">No items</span>
									{:else}
										{#each placed as item (item._id)}
											<div class="group relative w-20 sm:w-24 aspect-[4/5] rounded-2xl overflow-hidden shadow-md border border-white/20 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5 bg-zinc-900 shrink-0">
												{#if item.imageUrl}
													<img src={item.imageUrl} alt={item.name} draggable="false" class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" style="-webkit-touch-callout: none; -webkit-user-drag: none;" />
												{:else}
													<div class="absolute inset-0 bg-muted flex items-center justify-center text-xs text-muted-foreground select-none">
														No Photo
													</div>
												{/if}
												<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none"></div>
												<div class="absolute bottom-0 inset-x-0 p-1.5 pb-2 pointer-events-none">
													<p class="text-[10px] sm:text-[11px] font-bold text-white line-clamp-2 leading-tight drop-shadow-sm">{item.name}</p>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Add Item Photo Modal (Quick Popup Flow) -->
	{#if isAddModalOpen}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
			<div class="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-5 animate-in fade-in-0 zoom-in-95">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-bold tracking-tight inline-flex items-center gap-2">
						<CameraIcon class="w-5 h-5 text-rose-500" />
						<span>Add Next Tasting Item</span>
					</h3>
					<button
						type="button"
						onclick={() => (isAddModalOpen = false)}
						class="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
						aria-label="Close dialog"
					>
						<CloseIcon class="w-4 h-4" />
					</button>
				</div>

				<form onsubmit={handleAddItem} class="space-y-4">
					<!-- Camera / File Picker -->
					<div>
						<span class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
							Photo (Required)
						</span>
						{#if previewUrl}
							<div class="relative rounded-xl overflow-hidden border border-border h-48 bg-muted select-none">
								<img src={previewUrl} alt="Preview" draggable="false" class="w-full h-full object-cover select-none pointer-events-none" style="-webkit-touch-callout: none; -webkit-user-drag: none;" />
								<button
									type="button"
									onclick={() => fileInputRef?.click()}
									class="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-background/90 text-xs font-semibold backdrop-blur shadow-sm hover:bg-background"
								>
									Change Photo
								</button>
							</div>
						{:else}
							<button
								type="button"
								onclick={() => fileInputRef?.click()}
								class="w-full h-36 border-2 border-dashed border-border hover:border-primary/50 rounded-xl flex flex-col items-center justify-center gap-2 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
							>
								<CameraIcon class="w-8 h-8 text-muted-foreground/70" />
								<span class="text-sm font-semibold text-foreground">Snap Photo or Choose Image</span>
								<span class="text-xs text-muted-foreground">Syncs instantly to both screens</span>
							</button>
						{/if}
						<input
							type="file"
							accept="image/*"
							capture="environment"
							bind:this={fileInputRef}
							onchange={handleFileSelect}
							class="hidden"
						/>
					</div>

					<!-- Name / Label Input -->
					<div>
						<label for="item-name" class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
							Name / Label
						</label>
						<input
							id="item-name"
							type="text"
							bind:value={newItemName}
							placeholder="e.g. Chunky Garlic Dip"
							class="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
						/>
					</div>

					<!-- Notes Input -->
					<div>
						<label for="item-notes" class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
							Notes (Optional)
						</label>
						<input
							id="item-notes"
							type="text"
							bind:value={newItemNotes}
							placeholder="e.g. $3.99 at Trader Joe's, spicy kick"
							class="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
						/>
					</div>

					{#if uploadError}
						<p class="text-xs text-destructive">{uploadError}</p>
					{/if}

					<div class="flex items-center justify-end gap-2 pt-2">
						<button
							type="button"
							onclick={() => (isAddModalOpen = false)}
							class="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!selectedFile || isUploading}
							class="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
						>
							{isUploading ? 'Uploading & Syncing...' : 'Add to Tasting'}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Name Configuration / Blocking Required Modal -->
	{#if isNameModalOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
			role="presentation"
			onclick={(e) => {
				if (!isNameRequired && e.target === e.currentTarget) {
					isNameModalOpen = false;
				}
			}}
		>
			<div class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in-0 zoom-in-95">
				<div class="space-y-1">
					<div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
						<UserIcon class="w-5 h-5 text-primary" />
					</div>
					<h3 class="text-base font-bold tracking-tight text-foreground">
						{isNameRequired ? 'Welcome to the Tasting!' : 'Change Your Taster Name'}
					</h3>
					<p class="text-xs text-muted-foreground leading-relaxed">
						{isNameRequired
							? 'Please enter your name so other tasters at the table know whose ratings these are.'
							: 'Update your display name for this tasting session.'}
					</p>
				</div>

				<form
					onsubmit={(e) => {
						e.preventDefault();
						saveNewName();
					}}
					class="space-y-4"
				>
					<div>
						<label for="taster-name-input" class="sr-only">Taster Name</label>
						<input
							id="taster-name-input"
							type="text"
							bind:value={tempUserName}
							placeholder="Enter your name (e.g. Alex, Sam)"
							class="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
							required
						/>
					</div>
					<div class="flex items-center justify-end gap-2 pt-1">
						{#if !isNameRequired}
							<button
								type="button"
								onclick={() => (isNameModalOpen = false)}
								class="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted cursor-pointer"
							>
								Cancel
							</button>
						{/if}
						<button
							type="submit"
							disabled={!tempUserName.trim()}
							class="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
						>
							{isNameRequired ? 'Join Tasting' : 'Save Name'}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Item Detail Modal (Tapping picture without long-press) -->
	{#if selectedDetailItem}
		{@const detailItem = selectedDetailItem}
		{@const currentPlacement = myPlacementMap.get(detailItem._id)}
		{@const currentTierObj = currentPlacement ? s.tiers.find((t) => t.id === currentPlacement.tierId) : null}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-label="Item Details"
			onclick={(e) => {
				if (e.target === e.currentTarget) closeItemDetail();
			}}
		>
			<div class="w-full max-w-lg rounded-2xl sm:rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 my-auto flex flex-col max-h-[92vh]">
				<!-- Modal Header -->
				<div class="p-4 sm:p-5 flex items-center justify-between border-b border-border/70 shrink-0">
					<div class="min-w-0 pr-2">
						<h3 class="text-base sm:text-lg font-black tracking-tight text-foreground truncate">
							{detailItem.name}
						</h3>
						{#if detailItem.addedBy}
							<p class="text-[11px] sm:text-xs text-muted-foreground truncate">
								Added by <strong class="text-foreground">{detailItem.addedBy}</strong>
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={closeItemDetail}
						class="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
						aria-label="Close dialog"
					>
						<CloseIcon class="w-4 h-4" />
					</button>
				</div>

				<!-- Modal Scrollable Body -->
				<div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
					<!-- Large Photo -->
					<div class="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-950 border border-border/60 shadow-inner flex items-center justify-center">
						{#if detailItem.imageUrl}
							<img
								src={detailItem.imageUrl}
								alt={detailItem.name}
								class="w-full h-full object-contain select-none"
							/>
						{:else}
							<div class="flex flex-col items-center justify-center text-muted-foreground gap-2 p-8">
								<TastingBottleIcon class="w-12 h-12 text-muted-foreground/40" />
								<span class="text-xs">No Photo Available</span>
							</div>
						{/if}
					</div>

					<!-- Notes / Description -->
					{#if detailItem.notes}
						<div class="p-3 sm:p-3.5 rounded-xl bg-muted/50 border border-border/70 space-y-1">
							<p class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tasting Notes</p>
							<p class="text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed">{detailItem.notes}</p>
						</div>
					{/if}

					<!-- Current Placement Status & Tier Switcher -->
					{#if s.status === 'ranking'}
						<div class="p-3.5 sm:p-4 rounded-xl bg-card border border-border/80 space-y-3">
							<div class="flex items-center justify-between flex-wrap gap-2">
								<span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Ranking:</span>
								{#if currentTierObj}
									<span
										class="px-2.5 py-0.5 rounded-full text-xs font-black text-white shadow-xs inline-flex items-center gap-1.5"
										style="background-color: {currentTierObj.color};"
									>
										<span>Tier {currentTierObj.name}</span>
									</span>
								{:else}
									<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/60">
										Unranked
									</span>
								{/if}
							</div>

							<!-- Tier Selection Buttons -->
							<div class="space-y-1.5">
								<p class="text-[11px] text-muted-foreground">Assign or move to tier:</p>
								<div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
									{#each s.tiers as t (t.id)}
										{@const isSelected = currentPlacement?.tierId === t.id}
										<button
											type="button"
											onclick={() => handleMoveItem(detailItem._id, t.id)}
											class="h-9 rounded-xl text-xs font-black text-white flex items-center justify-center active:scale-95 transition-all shadow-xs cursor-pointer border hover:brightness-110 {isSelected
												? 'ring-2 ring-foreground ring-offset-2 ring-offset-background border-white'
												: 'border-white/10 opacity-85 hover:opacity-100'}"
											style="background-color: {t.color};"
											title="Move to {t.name}"
										>
											{t.name}
										</button>
									{/each}
								</div>

								{#if currentPlacement}
									<button
										type="button"
										onclick={() => handleMoveItem(detailItem._id, null)}
										class="w-full mt-2 py-2 px-3 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
									>
										<CloseIcon class="w-3.5 h-3.5" />
										<span>Return to Unranked Pool</span>
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Modal Footer (Host Delete Option & Close) -->
				<div class="p-3.5 sm:p-4 bg-muted/30 border-t border-border/70 flex items-center justify-between gap-2 shrink-0">
					{#if isCurrentUserHost}
						<button
							type="button"
							onclick={async () => {
								if (typeof window !== 'undefined' && !window.confirm(`Delete "${detailItem.name}" from this tasting session?`)) return;
								try {
									await removeItem({ itemId: detailItem._id });
									closeItemDetail();
								} catch (err) {
									console.error('Failed to remove item:', err);
								}
							}}
							class="text-xs font-semibold text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
						>
							Delete Item
						</button>
					{:else}
						<div></div>
					{/if}

					<button
						type="button"
						onclick={closeItemDetail}
						class="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-bold transition-colors cursor-pointer"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
