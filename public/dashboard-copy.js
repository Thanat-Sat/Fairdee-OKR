// ============================================================================
// COPY CHART/TABLE SNAPSHOTS TO CLIPBOARD
// ============================================================================

(function() {
    const HTML2CANVAS_SRC = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    let html2canvasPromise = null;
    let scanQueued = false;

    function loadHtml2Canvas() {
        if (window.html2canvas) return Promise.resolve(window.html2canvas);
        if (html2canvasPromise) return html2canvasPromise;

        html2canvasPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = HTML2CANVAS_SRC;
            script.async = true;
            script.onload = () => resolve(window.html2canvas);
            script.onerror = () => reject(new Error('Could not load screenshot renderer'));
            document.head.appendChild(script);
        });

        return html2canvasPromise;
    }

    function isInModal(el) {
        return Boolean(el.closest('.modal'));
    }

    function isOptedOut(el) {
        return Boolean(el.closest('[data-no-copy]'));
    }

    function isVisible(el) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    function getChartCaptureTarget(canvas) {
        return canvas.closest('.chart-card') ||
            canvas.closest('.chart-section') ||
            canvas.closest('.section-card') ||
            canvas.closest('div[style*="background:white"]') ||
            canvas.parentElement;
    }

    function getTableCaptureTarget(table) {
        return table.closest('.table-card') ||
            table.closest('.table-wrapper') ||
            table.closest('.targets-table-container') ||
            table.closest('.regional-table-container') ||
            table.closest('.agency-table-container') ||
            table.closest('.segment-table-container') ||
            table.closest('.renewal-table-container') ||
            table.closest('.focus-team-table-container') ||
            table.closest('.section-card') ||
            table.parentElement;
    }

    function getButtonMount(target) {
        const directHeader = Array.from(target.children).find(child =>
            child.matches('.section-header, .section-title, .table-title') ||
            (child.children.length > 0 && window.getComputedStyle(child).display === 'flex')
        );
        if (directHeader) return directHeader;

        const section = target.closest('section, .section-card, .chart-card, .table-card');
        const header = section?.querySelector(':scope > .section-header, :scope > .section-title, :scope > .table-title');
        return header || target;
    }

    function getLabel(target) {
        if (target.querySelector('canvas')) return 'Copy chart';
        if (target.querySelector('table')) return 'Copy table';
        return 'Copy snapshot';
    }

    function createButton(target) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-snapshot-btn';
        button.title = getLabel(target);
        button.setAttribute('aria-label', getLabel(target));
        button.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 7h6l1.2 2H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3.8L9 7z"></path>
                <circle cx="12" cy="14" r="3"></circle>
            </svg>
            <span>Copy</span>
        `;
        button.addEventListener('click', () => copySnapshot(target, button));
        return button;
    }

    function ensureButton(target) {
        if (!target || isInModal(target) || isOptedOut(target) || !isVisible(target)) return;

        const existing = target._copySnapshotButton;
        if (existing && existing.isConnected) return;

        const mount = getButtonMount(target);
        if (!mount) return;

        const button = createButton(target);
        target._copySnapshotButton = button;
        target.dataset.copySnapshotReady = 'true';

        if (mount === target) {
            const wrap = document.createElement('div');
            wrap.className = 'copy-snapshot-floating';
            wrap.appendChild(button);
            target.style.position = target.style.position || 'relative';
            target.prepend(wrap);
            return;
        }

        if (window.getComputedStyle(mount).display !== 'flex') {
            mount.classList.add('copy-snapshot-header');
        }
        mount.appendChild(button);
    }

    function scan() {
        scanQueued = false;
        const targets = new Set();

        document.querySelectorAll('canvas').forEach(canvas => {
            if (!isInModal(canvas) && isVisible(canvas)) targets.add(getChartCaptureTarget(canvas));
        });

        document.querySelectorAll('table').forEach(table => {
            if (!isInModal(table) && isVisible(table)) targets.add(getTableCaptureTarget(table));
        });

        targets.forEach(ensureButton);
    }

    function queueScan() {
        if (scanQueued) return;
        scanQueued = true;
        window.requestAnimationFrame(scan);
    }

    function setButtonState(button, state) {
        if (!button) return;
        if (state === 'loading') {
            button.disabled = true;
            button.dataset.originalHtml = button.innerHTML;
            button.innerHTML = '<span>Copying...</span>';
        } else if (state === 'done') {
            button.disabled = false;
            button.innerHTML = '<span>Copied</span>';
            setTimeout(() => {
                button.innerHTML = button.dataset.originalHtml || '<span>Copy</span>';
            }, 1400);
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalHtml || '<span>Copy</span>';
        }
    }

    // Temporarily unclip any scrollable containers inside the target so html2canvas
    // captures the FULL content (all rows/columns), not just what's on screen.
    // Returns a restore() function that puts the inline styles back exactly as they were.
    function expandScrollContainers(target) {
        const props = ['overflow', 'overflowX', 'overflowY', 'maxHeight', 'maxWidth', 'height', 'width', 'boxShadow'];
        const inner = [...target.querySelectorAll('*')].filter(el => {
            const style = window.getComputedStyle(el);
            const scrolls = /(auto|scroll|hidden)/.test(style.overflow + style.overflowX + style.overflowY);
            const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
            return scrolls && clipped;
        });

        // Always include the capture target itself, so its background/border wraps the
        // full (now-unclipped) content instead of leaving a ghost frame behind it.
        const candidates = [target, ...inner];

        const saved = candidates.map(el => {
            const original = {};
            props.forEach(prop => { original[prop] = el.style[prop]; });
            return { el, original };
        });

        saved.forEach(({ el }) => {
            el.style.overflow = 'visible';
            el.style.overflowX = 'visible';
            el.style.overflowY = 'visible';
            el.style.maxHeight = 'none';
            el.style.maxWidth = 'none';
            el.style.width = 'max-content';
            el.style.height = 'auto';
            // Drop the offset drop-shadow so it doesn't render as a frame in the snapshot.
            el.style.boxShadow = 'none';
        });

        return function restore() {
            saved.forEach(({ el, original }) => {
                props.forEach(prop => { el.style[prop] = original[prop]; });
            });
        };
    }

    async function copySnapshot(target, button) {
        let restoreScroll = null;
        try {
            setButtonState(button, 'loading');
            const html2canvas = await loadHtml2Canvas();

            // Unclip scroll containers and force a reflow so scrollWidth/scrollHeight
            // reflect the full content before we measure and capture.
            restoreScroll = expandScrollContainers(target);
            void target.scrollWidth;

            const canvas = await html2canvas(target, {
                backgroundColor: '#ffffff',
                scale: Math.min(window.devicePixelRatio || 1, 2),
                useCORS: true,
                width: target.scrollWidth,
                height: target.scrollHeight,
                windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
                windowHeight: Math.max(document.documentElement.clientHeight, target.scrollHeight),
                ignoreElements: el => el.classList?.contains('copy-snapshot-btn') ||
                    el.classList?.contains('copy-snapshot-floating')
            });

            restoreScroll();
            restoreScroll = null;

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Could not render snapshot');

            if (!navigator.clipboard || !window.ClipboardItem) {
                downloadSnapshot(blob);
                throw new Error('Clipboard image copy is not available here, so the snapshot was downloaded instead.');
            }

            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            setButtonState(button, 'done');
        } catch (error) {
            if (restoreScroll) restoreScroll();
            console.error('Copy snapshot failed:', error);
            setButtonState(button, 'idle');
            alert(error.message || 'Could not copy this snapshot.');
        }
    }

    function downloadSnapshot(blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dashboard-snapshot.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        queueScan();
        setTimeout(queueScan, 800);
        setTimeout(queueScan, 2000);

        const observer = new MutationObserver(queueScan);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    });

    window.FairdeeCopySnapshots = { scan: queueScan };
})();
