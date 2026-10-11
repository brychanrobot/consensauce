const isBrowser = typeof window !== 'undefined';

export type Theme = 'light' | 'dark' | 'system';

class ThemeStore {
  current = $state<Theme>('system');
  isDark = $state(false);

  constructor() {
    if (isBrowser) {
      const saved = (localStorage.getItem('consensauce_theme') ||
        localStorage.getItem('tears_theme')) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        this.current = saved;
      }
      this.updateState();

      // Listen for system changes
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', () => {
        if (this.current === 'system') {
          this.updateState();
        }
      });
    }
  }

  setTheme(theme: Theme) {
    this.current = theme;
    if (isBrowser) {
      localStorage.setItem('consensauce_theme', theme);
      this.updateState();
    }
  }

  toggle() {
    if (this.isDark) {
      this.setTheme('light');
    } else {
      this.setTheme('dark');
    }
  }

  private updateState() {
    if (!isBrowser) return;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = this.current === 'dark' || (this.current === 'system' && systemDark);

    this.isDark = shouldBeDark;
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }
}

export const theme = new ThemeStore();
