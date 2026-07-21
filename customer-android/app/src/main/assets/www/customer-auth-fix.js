(() => {
  if (window.__bubblyfiCustomerAuthFixV1) return;
  window.__bubblyfiCustomerAuthFixV1 = true;

  const CALLBACK_BASE = 'https://bubblyfi.netlify.app/auth-callback.html';

  signInWithProvider = async function(provider) {
    const button = document.querySelector(provider === 'google' ? '#authGoogle' : '#authFacebook');
    const original = button?.textContent || '';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = provider === 'google' ? 'Opening Google…' : 'Opening Facebook…';
      }
      const isAndroid = Boolean(window.AndroidBridge?.openExternalUrl);
      const redirectTo = `${CALLBACK_BASE}?target=${isAndroid ? 'android' : 'web'}`;
      const { data, error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined
        }
      });
      if (error) throw error;
      if (!data?.url) throw new Error('The authentication provider did not return a sign-in URL.');
      if (isAndroid) window.AndroidBridge.openExternalUrl(data.url);
      else window.location.assign(data.url);
    } catch (error) {
      const raw = String(error?.message || error || 'Could not start sign-in.');
      const message = /provider.*not enabled|unsupported provider/i.test(raw)
        ? `${provider === 'google' ? 'Google' : 'Facebook'} sign-in is not enabled in Supabase Authentication.`
        : raw;
      toast(message, 7000);
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  };

  window.addEventListener('pageshow', () => {
    ['#authGoogle', '#authFacebook'].forEach((selector) => {
      const button = document.querySelector(selector);
      if (button) button.disabled = false;
    });
  });
})();
