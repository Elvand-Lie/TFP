// @ts-check
/**
 * True Path — three-page report view.
 *
 * Renders the neutral block model from `lib/report-model.js` into DOM. One renderer serves the
 * online view and the printable view, so what a visitor reads online is exactly what the PDF
 * contains.
 *
 * Brief 8: view online (always), download as PDF, optional email — in that order. Brief 9: the
 * email form appears only AFTER the result, and report-delivery consent is a separate control
 * from marketing consent.
 *
 * This module holds no scoring logic: every number it draws arrived in the model.
 */

(function (root, factory) {
  const api = factory();
  if (root) /** @type {any} */ (root).TruePathReportView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * @param {string} tag
   * @param {any} [attrs]
   * @param {Array<any>} [children]
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2), value);
        } else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    (children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function text(value) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function listBlock(block) {
    const items = (block.items || []).filter(Boolean);
    return el('div', { class: 'tp-panel' }, [
      el('p', { class: 'tp-label', text: block.label }),
      items.length
        ? el('ul', { class: 'tp-list' }, items.map((item) => el('li', { text: item })))
        : el('p', { class: 'tp-muted', text: '—' })
    ]);
  }

  /**
   * @param {any} block
   * @param {any} ctx { Svg, iron }
   */
  function renderBlock(block, ctx) {
    switch (block.kind) {
      case 'talent-tree':
        return el('div', { class: 'tp-panel tp-center tp-report__visual' }, [
          el('div', {
            html: ctx.Svg.talentTreeSvg(block.pct, block.categories, {
              ariaLabel: 'Talent Tree: ' + describeScores(block.pct, block.categories)
            })
          })
        ]);

      case 'iron-triangle':
        return el('div', { class: 'tp-panel tp-center tp-report__visual' }, [
          el('div', {
            html: ctx.Svg.ironTriangleSvg(block.shares, block.roles, {
              ariaLabel:
                'Iron Triangle share: ' +
                block.roles
                  .map((role) => role.name + ' ' + block.shares[role.key] + ' percent')
                  .join(', ')
            })
          })
        ]);

      case 'scores':
        return el('div', { class: 'tp-panel' }, [
          el('p', { class: 'tp-label', text: block.label }),
          el(
            'div',
            { class: 'tp-bars' },
            block.rows.map((row) => {
              const host = el('div', { class: 'tp-bar' });
              host.innerHTML = ctx.Svg.scoreBar(row.name, text(row.value));
              return host;
            })
          )
        ]);

      case 'pair': {
        const children = [
          el('p', { class: 'tp-label', text: block.label }),
          el('p', {
            class: 'tp-h3',
            text: block.coDominant
              ? block.dominant + ' = ' + block.secondary
              : block.dominant + ' + ' + block.secondary
          })
        ];
        if (block.archetype) {
          children.push(
            el('p', { class: 'tp-report__archetype' }, [
              el('strong', { text: block.archetype.name }),
              document.createTextNode(' — ' + block.archetype.essence)
            ])
          );
        }
        if (block.balancedProfile) {
          children.push(el('p', { class: 'tp-muted', text: 'Balanced profile' }));
        }
        return el('div', { class: 'tp-panel' }, children);
      }

      case 'selections':
        return el('div', { class: 'tp-panel' }, [
          el('p', { class: 'tp-label', text: block.label }),
          el(
            'table',
            { class: 'tp-report__table' },
            [
              el(
                'tbody',
                {},
                block.rows.map((row) =>
                  el('tr', {}, [
                    el('th', { scope: 'row', text: row.label }),
                    el('td', { text: text(row.value) })
                  ])
                )
              )
            ]
          )
        ]);

      case 'text':
        return el('div', { class: 'tp-panel' }, [
          el('p', { class: 'tp-label', text: block.label }),
          el('p', { class: 'tp-report__body', text: text(block.text) })
        ]);

      case 'role-card':
        return el('div', { class: 'tp-panel tp-report__role' }, [
          el('p', { class: 'tp-label', text: block.label }),
          el('p', { class: 'tp-report__role-glyph', 'aria-hidden': 'true', text: block.glyph }),
          el('p', { class: 'tp-h3', text: block.name + ' ' + block.chinese }),
          el('p', { class: 'tp-muted', text: block.subtitle }),
          el('p', { class: 'tp-report__essence', text: block.essence }),
          el('p', { class: 'tp-report__body', text: block.oneLine }),
          el(
            'ul',
            { class: 'tp-list' },
            (block.naturalStrengths || []).map((item) => el('li', { text: item }))
          ),
          el('p', { class: 'tp-report__body', text: block.contribution }),
          el('p', { class: 'tp-muted', text: 'Watch-out: ' + block.watchOut })
        ]);

      case 'title':
        return el('div', { class: 'tp-panel tp-center tp-report__title' }, [
          el('p', { class: 'tp-label', text: block.label }),
          el('h2', { class: 'tp-title-block__title', text: block.title }),
          el('p', { class: 'tp-lead', text: block.essence }),
          el('p', { class: 'tp-muted', text: block.subtitle })
        ]);

      case 'invite':
        return el('div', { class: 'tp-panel tp-center' }, [
          el('h2', { class: 'tp-h2', text: block.headline }),
          el('p', { class: 'tp-lead', style: 'margin:12px auto 20px', text: block.text }),
          el('div', { class: 'tp-btn-row', style: 'justify-content:center' }, [
            el('a', {
              class: 'tp-btn',
              href: consultationHref(block),
              text: block.ctaLabel,
              target: '_blank',
              rel: 'noopener'
            })
          ])
        ]);

      default:
        return null;
    }
  }

  function consultationHref(block) {
    const base = block.ctaHref || '/contact';
    const separator = base.indexOf('?') === -1 ? '?' : '&';
    return base + separator + 'text=' + encodeURIComponent('True Path consultation');
  }

  function describeScores(pct, categories) {
    return categories.map((category) => category.name + ' ' + pct[category.key] + ' percent').join(', ');
  }

  // ─── email capture (Brief 9) ───────────────────────────────────────────────

  /**
   * Builds the post-result email form. Report delivery and marketing consent are two separate
   * checkboxes, and submission is guarded so it can never fire twice (Brief 17).
   *
   * @param {any} model
   * @param {any} options { endpoint, onSent, recordPayload }
   */
  function emailForm(model, options) {
    const email = model.email;
    const status = el('p', { class: 'tp-status', role: 'status', 'aria-live': 'polite' });

    const nameInput = /** @type {any} */ (el('input', {
      class: 'tp-input',
      type: 'text',
      id: 'tp-report-name',
      name: 'firstName',
      autocomplete: 'given-name',
      maxlength: '80'
    }));
    const emailInput = /** @type {any} */ (el('input', {
      class: 'tp-input',
      type: 'email',
      id: 'tp-report-email',
      name: 'email',
      autocomplete: 'email',
      required: true,
      maxlength: '254'
    }));

    const marketing = /** @type {any} */ (el('input', {
      class: 'tp-checkbox',
      type: 'checkbox',
      id: 'tp-report-marketing',
      name: 'marketingConsent'
    }));

    const sendBtn = /** @type {any} */ (el('button', {
      class: 'tp-btn',
      type: 'submit',
      text: email.sendLabel
    }));

    const form = el('form', { class: 'tp-form', novalidate: true }, [
      el('div', { class: 'tp-field' }, [
        el('label', { for: 'tp-report-name', text: email.fieldName }),
        nameInput
      ]),
      el('div', { class: 'tp-field' }, [
        el('label', { for: 'tp-report-email', text: email.fieldEmail }),
        emailInput
      ]),
      el('div', { class: 'tp-field tp-field--check' }, [
        marketing,
        el('label', { for: 'tp-report-marketing', text: email.marketingLabel })
      ]),
      el('div', { class: 'tp-btn-row' }, [
        sendBtn,
        el('button', {
          class: 'tp-btn tp-btn--ghost',
          type: 'button',
          text: email.skipLabel,
          onClick: () => {
            panel.hidden = true;
          }
        })
      ]),
      status,
      el('p', { class: 'tp-form__note' }, [
        document.createTextNode(email.consentNote + ' '),
        el('a', { href: email.privacyHref, text: email.privacyLabel })
      ])
    ]);

    // Idempotency: once submitted the control is gone, so a duplicate cannot be sent.
    let submitted = false;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (submitted) return;

      const value = String(emailInput.value || '').trim();
      if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        emailInput.setAttribute('aria-invalid', 'true');
        status.textContent = 'Please enter a valid email address.';
        emailInput.focus();
        return;
      }
      emailInput.removeAttribute('aria-invalid');

      submitted = true;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      status.textContent = '';

      const payload = {
        resultId: model.resultId,
        firstName: String(nameInput.value || '').trim() || null,
        email: value,
        reportConsent: true,
        marketingConsent: Boolean(marketing.checked),
        // The record travels with the submission so the report can be emailed even when no
        // server-side store is configured; the API falls back to a store lookup by resultId.
        payload: options.recordPayload || null
      };

      fetch(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then((response) => {
          if (!response.ok) throw new Error('Request failed: ' + response.status);
          return response.json().catch(() => ({}));
        })
        .then(() => {
          status.textContent = email.sentMessage;
          form.querySelectorAll('input, button').forEach((node) => {
            /** @type {any} */ (node).disabled = true;
          });
          if (options.onSent) options.onSent();
        })
        .catch((error) => {
          // Recoverable: let the visitor try again rather than losing the form.
          submitted = false;
          sendBtn.disabled = false;
          sendBtn.textContent = email.sendLabel;
          status.textContent = 'We could not send that just now. Please try again.';
          if (window.console && console.warn) console.warn('[true-path] report email failed', error);
        });
    });

    const panel = el('section', { class: 'tp-panel tp-report__email' }, [
      el('h2', { class: 'tp-h2', text: email.headline }),
      form
    ]);
    return panel;
  }

  // ─── renderer ──────────────────────────────────────────────────────────────

  /**
   * Render the whole report.
   *
   * @param {any} host container element
   * @param {any} model report model from buildReportModel
   * @param {any} deps { Svg, iron, emailEndpoint, onEmailSent, canDownloadPdf }
   * @returns {{ element: any, destroy: () => void }}
   */
  function render(host, model, deps) {
    const onSent = deps.onEmailSent;
    const ctx = { Svg: deps.Svg, iron: deps.iron };

    const downloadBtn = el('a', {
      class: 'tp-btn',
      href: deps.pdfEndpoint || '',
      text: model.downloadLabel
    });
    if (!deps.canDownloadPdf) {
      downloadBtn.setAttribute('aria-disabled', 'true');
      downloadBtn.setAttribute('tabindex', '-1');
      downloadBtn.classList.add('tp-btn--disabled');
    }

    const header = el('header', { class: 'tp-report__header' }, [
      el('p', { class: 'tp-eyebrow', text: 'True Path \u00b7 \u8f68\u9053' }),
      el('h1', { class: 'tp-h1', text: model.headline }),
      el('p', {
        class: 'tp-muted tp-report__meta',
        text:
          model.resultId +
          ' \u00b7 ' +
          (model.createdAt ? String(model.createdAt).slice(0, 10) : '')
      }),
      el('div', { class: 'tp-btn-row tp-report__toolbar' }, [downloadBtn])
    ]);

    const pages = model.pages.map((page) =>
      el('article', { class: 'tp-report__page', 'data-page': String(page.n) }, [
        el('div', { class: 'tp-report__page-head' }, [
          el('span', { class: 'tp-report__page-n', 'aria-hidden': 'true', text: String(page.n) }),
          el('h2', { class: 'tp-h2', text: page.heading })
        ]),
        el(
          'div',
          { class: 'tp-report__blocks' },
          page.blocks.map((block) => renderBlock(block, ctx)).filter(Boolean)
        ),
        el('p', { class: 'tp-report__page-foot', text: model.brand })
      ])
    );

    const container = el('div', { class: 'tp-report' }, [
      header,
      el('div', { class: 'tp-report__pages' }, pages),
      el('p', { class: 'tp-muted tp-center tp-report__disclaimer', text: model.disclaimer }),
      // Brief 9: email capture comes after the result has already been delivered online.
      emailForm(model, { endpoint: deps.emailEndpoint, onSent: onSent, recordPayload: deps.recordPayload }),
      el('p', { class: 'tp-report__brand', text: model.brand })
    ]);

    host.appendChild(container);
    host.hidden = false;

    return {
      element: container,
      destroy() {
        if (container.parentNode) container.parentNode.removeChild(container);
      }
    };
  }

  return Object.freeze({ render, renderBlock, emailForm, describeScores });
});
