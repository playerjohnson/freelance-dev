/* Optional analytics and advertising paused on 12 September 2026.
 * Re-enabling providers requires a reviewed consent and purpose-separation change.
 */
(function () {
    'use strict';
    const base = '/freelance-dev/';
    if (!location.pathname.startsWith(base) && location.pathname !== base.slice(0, -1)) return;

    // Preserve callers without loading providers, queuing events or accessing storage.
    // Existing preferences and shared-origin cookies remain untouched.
    window.trackEvent = function () {};
})();
