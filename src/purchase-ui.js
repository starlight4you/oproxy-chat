(() => {
  if (location.origin !== 'https://oproxy.world') return;
  const enabled = location.pathname === '/purchase' || location.pathname.startsWith('/payment/');
  document.documentElement.toggleAttribute('data-oproxy-purchase-window', enabled);
  if (document.getElementById('oproxy-purchase-window-style')) return;
  const style = document.createElement('style');
  style.id = 'oproxy-purchase-window-style';
  style.textContent = `
    html[data-oproxy-purchase-window] .app-shell > aside { display: none !important; }
    html[data-oproxy-purchase-window] .app-shell__body {
      margin-left: 0 !important; margin-right: 0 !important;
      margin-inline: 0 !important;
      transition: none !important;
      --oproxy-current-left-rail-width: 0px !important;
      --oproxy-action-rail-width: 0px !important;
    }
    html[data-oproxy-purchase-window] .app-header {
      left: 0 !important; right: 0 !important; width: 100% !important;
    }
    html[data-oproxy-purchase-window] .app-header__mobile-menu,
    html[data-oproxy-purchase-window] .app-header__account,
    html[data-oproxy-purchase-window] .app-header__mobile-preferences { display: none !important; }
    html[data-oproxy-purchase-window] .app-shell__main {
      margin-left: 0 !important; margin-right: 0 !important;
      margin-inline: 0 !important; border-radius: 0 !important;
      background: transparent !important;
    }
    html[data-oproxy-purchase-window] .app-shell__main-scroll > div {
      max-width: 1200px !important; margin-inline: auto !important;
    }
  `;
  document.head.append(style);
})();
