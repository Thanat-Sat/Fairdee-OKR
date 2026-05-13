// ============================================================================
// SHARED ICON SET — minimal stroke SVGs, inherit currentColor and font-size
// Usage:
//   In HTML: paste the SVG markup directly, or read window.ICONS.<name>
//   In JS templates: ${ICONS.target} or ${icon('target')}
// ============================================================================

(function () {
    const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -0.15em; flex-shrink: 0;">';
    const SVG_CLOSE = '</svg>';

    const PATHS = {
        // Status
        check:           '<polyline points="20 6 9 17 4 12"></polyline>',
        'check-circle':  '<circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline>',
        x:               '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
        'x-circle':      '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        alert:           '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><circle cx="12" cy="17" r="0.5" fill="currentColor"></circle>',
        'alert-octagon': '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><circle cx="12" cy="16" r="0.5" fill="currentColor"></circle>',
        sparkle:         '<path d="M12 3 14 10 21 12 14 14 12 21 10 14 3 12 10 10 12 3z"></path>',

        // Data / charts
        'bar-chart':     '<line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line><line x1="3" y1="20" x2="21" y2="20"></line>',
        'trending-up':   '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline>',
        'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline>',
        target:          '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2" fill="currentColor"></circle>',
        trophy:          '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>',

        // Files / data
        'file-text':     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',
        folder:          '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
        calendar:        '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
        refresh:         '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>',
        tool:            '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>',

        // People / misc
        user:            '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
    };

    function icon(name, opts) {
        opts = opts || {};
        const inner = PATHS[name];
        if (!inner) {
            console.warn('[icons] unknown icon:', name);
            return '';
        }
        const size  = opts.size  ? ` width="${opts.size}" height="${opts.size}"` : '';
        const style = opts.style ? ` style="${opts.style}"`                       : '';
        return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -0.15em; flex-shrink: 0;${opts.style ? ' ' + opts.style : ''}">${inner}</svg>`;
    }

    const ICONS = {};
    Object.keys(PATHS).forEach(name => {
        ICONS[name.replace(/-/g, '_')] = SVG_OPEN + PATHS[name] + SVG_CLOSE;
        // Allow access via the kebab-case form too
        ICONS[name] = SVG_OPEN + PATHS[name] + SVG_CLOSE;
    });

    window.ICONS = ICONS;
    window.icon = icon;
})();
