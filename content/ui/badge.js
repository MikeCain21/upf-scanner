/**
 * NOVA Extension - Badge Component
 *
 * Creates and manages NOVA classification badge DOM elements.
 * Handles all badge states: scored (NOVA 1–4), loading, and error.
 * Provides a tooltip on hover via a singleton element on document.body.
 *
 * Registers on window.__novaExt:
 *   createBadge(novaScore, reason, indicators) → Element
 *   setBadgeLoading(badgeEl)                  → void
 *   setBadgeError(badgeEl, message)            → void
 *   injectBadge(productEl, badgeEl)            → void
 *
 * @version 0.7.0
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** Human-readable NOVA group labels shown in tooltips */
  const NOVA_LABELS = {
    1: 'Unprocessed or minimally processed food',
    2: 'Processed culinary ingredients',
    3: 'Processed food',
    4: 'Ultra-processed food',
  };

  /** CSS class names for each NOVA score — these match styles.css */
  const NOVA_BADGE_CLASS = {
    1: 'nova-badge-1',
    2: 'nova-badge-2',
    3: 'nova-badge-3',
    4: 'nova-badge-4',
  };

  // ---------------------------------------------------------------------------
  // Shared tooltip singleton
  // ---------------------------------------------------------------------------

  /** Lazily-created tooltip element, appended to document.body on first use */
  let _tooltipEl = null;

  /**
   * Returns the shared tooltip element, creating it on first call.
   * @returns {HTMLElement}
   */
  function getTooltip() {
    if (!_tooltipEl) {
      _tooltipEl = document.createElement('div');
      _tooltipEl.className = 'nova-tooltip';
      _tooltipEl.style.display = 'none';
      document.body.appendChild(_tooltipEl);
    }
    return _tooltipEl;
  }

  /**
   * Positions and shows the tooltip above the anchor element.
   * Uses position:fixed so it stays put during scroll.
   *
   * @param {HTMLElement} tooltip
   * @param {HTMLElement} anchorEl
   */
  function _showTooltip(tooltip, anchorEl) {
    tooltip.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    // translateY(-100%) moves tooltip above the anchor; 8px gap below it
    tooltip.style.top = `${rect.top - 8}px`;
    tooltip.style.transform = 'translateY(-100%)';
  }

  /**
   * Hides the tooltip.
   * @param {HTMLElement} tooltip
   */
  function _hideTooltip(tooltip) {
    tooltip.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a human-readable tooltip string from classification data.
   *
   * @param {number} novaScore
   * @param {string} reason
   * @param {string[]} indicators
   * @returns {string}
   */
  function _buildTooltipText(novaScore, reason, indicators) {
    const label = NOVA_LABELS[novaScore] || '';
    let text = `NOVA ${novaScore}: ${label}`;
    if (reason) {
      text += `\n${reason}`;
    }
    if (Array.isArray(indicators) && indicators.length > 0) {
      // Show up to 5 indicators to keep the tooltip readable
      text += `\n\nIndicators: ${indicators.slice(0, 5).join(', ')}`;
    }
    return text;
  }

  /**
   * Attaches mouseenter/mouseleave listeners that show/hide the shared tooltip.
   *
   * @param {HTMLElement} badgeEl
   * @param {string} tooltipText - Text to show on hover
   */
  function _attachTooltip(badgeEl, tooltipText) {
    // Pre-create the tooltip element so it exists on document.body from first badge creation
    getTooltip();
    badgeEl.addEventListener('mouseenter', () => {
      const tooltip = getTooltip();
      tooltip.textContent = tooltipText;
      _showTooltip(tooltip, badgeEl);
    });

    badgeEl.addEventListener('mouseleave', () => {
      _hideTooltip(getTooltip());
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Creates a scored NOVA badge element (NOVA 1–4).
   *
   * @param {number} novaScore - NOVA group 1–4
   * @param {string} reason - Human-readable classification reason
   * @param {string[]} [indicators] - NOVA 4 indicators found (may be empty)
   * @returns {HTMLElement} Badge span element
   */
  function createBadge(novaScore, reason, indicators) {
    const badge = document.createElement('span');
    const scoreClass = NOVA_BADGE_CLASS[novaScore] || 'nova-badge-error';
    badge.className = `nova-badge ${scoreClass}`;
    badge.textContent = `NOVA ${novaScore}`;
    badge.setAttribute('aria-label', `NOVA ${novaScore} - ${NOVA_LABELS[novaScore] || 'unknown'}`);

    const tooltipText = _buildTooltipText(novaScore, reason, indicators);
    _attachTooltip(badge, tooltipText);

    return badge;
  }

  /**
   * Transitions an existing badge element to the loading state ("...").
   * Call this before the async classification result is available.
   *
   * @param {HTMLElement} badgeEl
   */
  function setBadgeLoading(badgeEl) {
    badgeEl.className = 'nova-badge nova-badge-loading';
    badgeEl.textContent = '...';
    badgeEl.setAttribute('aria-label', 'NOVA score loading');
  }

  /**
   * Transitions an existing badge element to the error state ("?").
   *
   * @param {HTMLElement} badgeEl
   * @param {string} [message] - Optional explanation shown in tooltip
   */
  function setBadgeError(badgeEl, message) {
    badgeEl.className = 'nova-badge nova-badge-error';
    badgeEl.textContent = '?';
    badgeEl.setAttribute('aria-label', 'NOVA score unavailable');
    _attachTooltip(badgeEl, message || 'Classification unavailable for this product');
  }

  /**
   * Injects a badge element adjacent to the product element.
   *
   * For the main PDP product (H1), inserts the badge immediately after the H1.
   * For product tiles ([data-product-id]), inserts after the first anchor link
   * in the tile (the product title link), or at the start of the tile if no
   * anchor is found.
   *
   * @param {HTMLElement} productEl - Product element from detectProducts()
   * @param {HTMLElement} badgeEl   - Badge element to inject
   */
  function injectBadge(productEl, badgeEl) {
    if (productEl.tagName === 'H1') {
      // Main PDP product: badge appears immediately after the H1 block
      productEl.insertAdjacentElement('afterend', badgeEl);
      return;
    }

    // Product tile: inject after the first anchor (title link) so the badge
    // sits alongside the product name
    const titleLink = productEl.querySelector('a');
    if (titleLink) {
      titleLink.insertAdjacentElement('afterend', badgeEl);
    } else {
      productEl.insertAdjacentElement('afterbegin', badgeEl);
    }
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  window.__novaExt = window.__novaExt || {};
  window.__novaExt.createBadge = createBadge;
  window.__novaExt.setBadgeLoading = setBadgeLoading;
  window.__novaExt.setBadgeError = setBadgeError;
  window.__novaExt.injectBadge = injectBadge;
})();
