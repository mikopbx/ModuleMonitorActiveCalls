/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */
const idUrl = 'module-monitor-active-calls';
const idForm = 'module-monitor-active-calls-form';
const className = 'ModuleMonitorActiveCalls';
const inputClassName = 'mikopbx-module-input';

/* global $, globalRootUrl, globalTranslate, Form, Config, Vue, Extensions */
const ModuleMonitorActiveCalls = {
  isInit: true,
  contactsCacheTtlMs: 120 * 60 * 1000,
  queuesFilterSelector: '#queuesFilter',
  $formObj: $('#' + idForm),
  $checkBoxes: $('#' + idForm + ' .ui.checkbox'),
  $dropDowns: $('#' + idForm + ' .ui.dropdown'),
  activeChannelsUrl: globalRootUrl + idUrl + "/getActiveChannels",
  activeChannelsUrlV2: globalRootUrl + idUrl + "/getActiveChannelsV2",
  backendEnableUrl: globalRootUrl + idUrl + "/backandEnable",
  executeCallUrl: globalRootUrl + idUrl + "/executeCall",
  saveUserActionUrl: globalRootUrl + idUrl + "/saveUser",
  $widget: undefined,
  _backendTransport: 'polling',
  _backendRoutes: {},
  _authTokens: {},
  _activeCallsWsLastMessageAt: 0,
  _activeCallsWsWatchdogTimer: null,
  activeCallsWsSilenceTimeoutMs: 10000,
  normalizeActiveCallsPayload(data) {
    const payload = data && typeof data === 'object' ? data : {};
    const queues = payload.queues && typeof payload.queues === 'object' && !Array.isArray(payload.queues) ? payload.queues : {};
    return {
      calls: Array.isArray(payload.calls) ? payload.calls : [],
      queues: queues
    };
  },
  /**
   * Field validation rules
   * https://semantic-ui.com/behaviors/form.html
   */
  validateRules: {},
  /**
   * On page load we init some Semantic UI library
   */
  initialize() {
    this.initContactsCache();
    $("#nowUser.dropdown.enable").dropdown({
      onChange: function onChange(value, text, $choice) {
        window[className].onChangeSetting('adminUserId', value);
      }
    });
    $("#minWaitVisible.dropdown.enable").dropdown({
      onChange: function onChange(value, text, $choice) {
        $('#minWaitVisibleValue').val(value);
        window[className].onChangeSetting('minWaitVisible', value);
      }
    });
    let userNumber = $('#userNumber').val();
    window[className].$widgetQueues = new Vue({
      el: '#app-queue',
      delimiters: ["<%", "%>"],
      methods: {
        updatedCallsFromResponse(data) {
          const payload = window[className].normalizeActiveCallsPayload(data);
          // Keep last payload to allow re-render on queue switch (WS mode).
          this.lastActiveCallsPayload = payload;
          this.minWaitVisible = 1 * $('#minWaitVisibleValue').val();
          this.queues = payload.queues;
          this.allCalls = payload.calls;

          // Initialize multi-select dropdown if not yet done
          this.initQueuesFilter();

          // Normalize Semantic UI Card typography after render
          this.$nextTick(function () {
            this.normalizeAgentCards();
          });
        },
        initQueuesFilter() {
          var self = this;
          var $filter = $(window[className].queuesFilterSelector);
          if ($filter.length === 0) return;

          // Wait for Vue to render menu items
          this.$nextTick(function () {
            // Reinitialize dropdown to pick up new menu items
            if ($filter.data('initialized')) {
              // Dropdown already exists, just refresh menu
              // Save current selection before refresh to prevent reset
              var currentSelection = self.selectedQueueIds ? self.selectedQueueIds.slice() : [];
              $filter.data('refreshing', true);
              $filter.dropdown('refresh');
              $filter.data('refreshing', false);

              // Restore selection after refresh if it was cleared
              if (currentSelection.length > 0 && (!self.selectedQueueIds || self.selectedQueueIds.length === 0)) {
                self.selectedQueueIds = currentSelection;
                $filter.dropdown('set exactly', currentSelection);
              }

              // After refresh, ensure default text is hidden if we have selections
              if (self.selectedQueueIds && self.selectedQueueIds.length > 0) {
                $filter.find('.default.text').hide();
              } else {
                $filter.find('.default.text').show();
              }
            } else {
              // First time initialization
              $filter.data('initialized', true);
              $filter.dropdown({
                fullTextSearch: true,
                onChange: function (value) {
                  // Skip onChange during programmatic refresh
                  if ($filter.data('refreshing')) {
                    return;
                  }
                  // value is comma-separated string of selected queue IDs
                  var selectedIds = value ? value.split(',').filter(function (v) {
                    return v !== '';
                  }) : [];
                  self.selectedQueueIds = selectedIds;
                  // Auto-save on change
                  window[className].onChangeSetting('queueIds', JSON.stringify(selectedIds));
                }
              });

              // Set initial values from hidden input
              var savedQueueIds = [];
              try {
                var raw = $('#queueIds').val();
                savedQueueIds = JSON.parse(raw || '[]');
              } catch (e) {
                savedQueueIds = [];
              }
              if (Array.isArray(savedQueueIds) && savedQueueIds.length > 0) {
                window[className].isInit = true;
                $filter.dropdown('set exactly', savedQueueIds);
                self.selectedQueueIds = savedQueueIds;
                window[className].isInit = false;
                // Hide default text when values are selected
                $filter.find('.default.text').hide();
              }
            }
          });
        },
        refreshFromLastPayload() {
          if (this.lastActiveCallsPayload) {
            this.updatedCallsFromResponse(this.lastActiveCallsPayload);
          }
        },
        getQueueCalls(queueId) {
          var queue = this.queues[queueId];
          if (!queue) return [];
          return Array.isArray(queue.calls) ? queue.calls : [];
        },
        getQueueAgentsList(queueId) {
          var queue = this.queues[queueId];
          if (!queue || !queue.agents) return [];
          return this.buildAgentsList(queue.agents);
        },
        hasWaitingCalls(queueId) {
          var calls = this.getQueueCalls(queueId);
          var self = this;
          for (var i = 0; i < calls.length; i++) {
            var call = calls[i];
            if (call.dst_chan === '' && call.queueData && call.queueData.EnterTime !== undefined) {
              var elapsed = self.formatElapsedTime(call.queueData.EnterTime);
              if (self.minWaitVisible <= elapsed) {
                return true;
              }
            }
          }
          return false;
        },
        buildAgentsList(agentsObj) {
          const entries = Object.entries(agentsObj || {});
          const available = [];
          const unavailable = [];
          for (const [number, agent] of entries) {
            const state = agent?.state || '';
            const item = {
              number,
              ...agent
            };
            if (state === 'Unavailable') {
              unavailable.push(item);
            } else {
              available.push(item);
            }
          }
          return available.concat(unavailable);
        },
        normalizePhone10(phone) {
          const digits = String(phone || '').replace(/\D+/g, '');
          if (digits.length <= 10) return digits;
          return digits.slice(-10);
        },
        updateContactFromWs(contact) {
          const phone10 = this.normalizePhone10(contact?.number);
          if (!phone10) return;
          const displayName = String(contact?.client || contact?.contact || '').trim();
          if (!displayName) return;
          // Vue2: ensure reactivity for new keys
          if (this.$set) {
            this.$set(this.contactsByPhone10, phone10, displayName);
          } else {
            this.contactsByPhone10[phone10] = displayName;
          }
        },
        getClientNameByPhone(phone) {
          const phone10 = this.normalizePhone10(phone);
          return this.contactsByPhone10[phone10] || '';
        },
        getClientHeader(phone) {
          const client = this.getClientNameByPhone(phone);
          if (!client) return phone;
          return `${client} <${phone}>`;
        },
        hasClientByPhone(phone) {
          return !!this.getClientNameByPhone(phone);
        },
        formatElapsedTime(enterTime) {
          // Make this method reactive to the UI ticker.
          void this.nowTick;
          return window[className].formatElapsedTime(enterTime);
        },
        normalizeAgentCards() {
          if (!this.$el) return;
          var self = this;

          // Cleanup artifacts from previous experiments (placeholders/spacers).
          var artifacts = this.$el.querySelectorAll('.agent-peer-placeholder, .agent-peer-spacer');
          artifacts.forEach(function (el) {
            el.remove();
          });

          // Dense layout (masonry) that still fills left-to-right:
          // flex-wrap can't place items into vertical gaps under tall cards.
          this.ensureAgentCardsGridMasonry();

          // Process all agent card containers (one per queue block)
          var cardsContainers = this.$el.querySelectorAll('.ui.cards.agent-cards');
          cardsContainers.forEach(function (cardsContainer) {
            cardsContainer.style.alignItems = 'flex-start';
            cardsContainer.style.alignContent = 'flex-start';
          });
          var cards = this.$el.querySelectorAll('.ui.cards.agent-cards > .ui.card.agent-card');
          cards.forEach(function (card) {
            card.style.alignSelf = 'flex-start';
          });

          // Semantic UI makes .header bigger than normal text; we need same font size.
          var headers = this.$el.querySelectorAll('.ui.card.agent-card .header.agent-card-header');
          headers.forEach(function (el) {
            el.style.fontSize = '1em';
            el.style.lineHeight = '1.2';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.gap = '0.5em';
            el.style.whiteSpace = 'nowrap';
          });
          var metas = this.$el.querySelectorAll('.ui.card.agent-card .meta.agent-peer');
          metas.forEach(function (el) {
            el.style.fontSize = '1em';
            el.style.lineHeight = '1.2';
          });

          // Normalize label/name typography so they have same text height.
          var numLabels = this.$el.querySelectorAll('.ui.card.agent-card .agent-num-label');
          numLabels.forEach(function (el) {
            el.style.fontSize = '1em';
            el.style.lineHeight = '1.2';
            el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.paddingTop = '0';
            el.style.paddingBottom = '0';
            // Allow label to shrink (otherwise long numbers force card wider than 180px)
            el.style.flex = '0 1 auto';
            el.style.minWidth = '0';
            el.style.maxWidth = '14ch';
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
            el.style.whiteSpace = 'nowrap';
          });
          var names = this.$el.querySelectorAll('.ui.card.agent-card .agent-name');
          names.forEach(function (el) {
            el.style.lineHeight = '1.2';
            // Ellipsis for long names (e.g. "Салтыков-Щедрин")
            el.style.minWidth = '0';
            el.style.flex = '1 1 auto';
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
            el.style.whiteSpace = 'nowrap';
          });

          // Grid masonry needs row-span calculation after layout.
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              self.layoutAgentCardsGridMasonry();
            });
          });
        },
        adjustAgentCardsGap() {
          if (!this.$el) return;
          const container = this.$el.querySelector('.ui.cards.agent-cards');
          if (!container) return;
          const cards = Array.from(container.querySelectorAll('.ui.card.agent-card'));
          if (!cards.length) return;
          const tallCard = cards.find(c => c.querySelector('.meta.agent-peer'));
          const shortCard = cards.find(c => !c.querySelector('.meta.agent-peer'));
          if (!tallCard || !shortCard) return;
          const ht = tallCard.getBoundingClientRect().height;
          const hs = shortCard.getBoundingClientRect().height;
          if (!ht || !hs) return;

          // From 2*(hs+g) = ht+g => g = ht - 2*hs
          let gap = ht - 2 * hs;
          if (!Number.isFinite(gap)) return;

          // Clamp to sane range; negative means "no extra gap needed".
          gap = Math.max(0, Math.min(20, Math.round(gap)));
          container.style.setProperty('--agent-card-gap', `${gap}px`);
        },
        adjustAgentCardsColumnCount() {
          if (!this.$el) return;
          const container = this.$el.querySelector('.ui.cards.agent-cards.agent-cards-masonry');
          if (!container) return;
          const w = container.clientWidth;
          if (!w) return;

          // Minimum acceptable card width in px (tune if needed)
          const minCardWidth = 150;
          const cs = window.getComputedStyle(container);
          const gapRaw = cs.columnGap || cs.getPropertyValue('column-gap') || '16px';
          const gapPx = parseFloat(gapRaw) || 16;
          const count = Math.max(1, Math.min(12, Math.floor((w + gapPx) / (minCardWidth + gapPx))));
          container.style.setProperty('--agent-card-col-count', String(count));
        },
        ensureAgentCardsGridMasonry() {
          var self = this;
          var styleId = 'agent-cards-layout-style';
          var styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }

          // Grid masonry: fills left-to-right and can pack items into gaps.
          // minmax(240px, 1fr) - карточки минимум 240px, растягиваются равномерно
          styleEl.textContent = '\
.ui.cards.agent-cards.agent-cards-grid {\
  display: grid !important;\
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\
  justify-content: start;\
  gap: var(--agent-card-gap, 8px);\
  grid-auto-rows: 1px;\
  margin-bottom: 1em !important;\
}\
.ui.cards.agent-cards.agent-cards-grid > .ui.card.agent-card {\
  width: 100% !important;\
  min-width: 0;\
  margin: 0 !important;\
  overflow: hidden;\
  align-self: start;\
}';

          // Process all agent card containers (one per queue block)
          var cardsContainers = this.$el ? this.$el.querySelectorAll('.ui.cards.agent-cards') : [];
          cardsContainers.forEach(function (cardsContainer) {
            cardsContainer.classList.remove('agent-cards-masonry');
            cardsContainer.classList.remove('agent-cards-flex');
            cardsContainer.classList.add('agent-cards-grid');
          });

          // Bind once: relayout on resize.
          if (!this._agentCardsResizeBound) {
            this._agentCardsResizeBound = true;
            window.addEventListener('resize', function () {
              self.layoutAgentCardsGridMasonry();
            });
          }
        },
        layoutAgentCardsGridMasonry() {
          if (!this.$el) return;
          var self = this;

          // Process all grid containers (one per queue block)
          var grids = this.$el.querySelectorAll('.ui.cards.agent-cards.agent-cards-grid');
          grids.forEach(function (grid) {
            self.layoutSingleGridMasonry(grid);
          });
        },
        layoutSingleGridMasonry(grid) {
          if (!grid) return;
          var cs = window.getComputedStyle(grid);
          var rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 1;
          var rowGap = parseFloat(cs.getPropertyValue('row-gap')) || parseFloat(cs.getPropertyValue('gap')) || 8;
          var items = Array.from(grid.querySelectorAll('.ui.card.agent-card'));
          if (!items.length) return;

          // Reset row spans and min-heights to measure natural heights.
          items.forEach(function (item) {
            item.style.gridRowEnd = '';
            item.style.minHeight = '';
          });
          var tall = items.filter(function (c) {
            return c.querySelector('.meta.agent-peer');
          });
          var short = items.filter(function (c) {
            return !c.querySelector('.meta.agent-peer');
          });

          // If we don't have both types, just do normal masonry spans.
          if (!tall.length || !short.length) {
            items.forEach(function (item) {
              var h = item.getBoundingClientRect().height;
              var span = Math.max(1, Math.ceil((h + rowGap) / (rowHeight + rowGap)));
              item.style.gridRowEnd = 'span ' + span;
            });
            return;
          }
          var shortHeights = short.map(function (c) {
            return c.getBoundingClientRect().height;
          });
          var tallHeights = tall.map(function (c) {
            return c.getBoundingClientRect().height;
          });
          var hs = Math.max.apply(Math, shortHeights);
          var ht = Math.max.apply(Math, tallHeights);

          // Want: 2*(hs + g) = (ht + g)  => g = ht - 2*hs
          var g = ht - 2 * hs;
          if (!Number.isFinite(g)) g = rowGap;
          g = Math.max(0, Math.min(24, Math.round(g)));

          // Apply gap and enforce min-heights so the relation holds visually.
          grid.style.setProperty('--agent-card-gap', g + 'px');
          var shortH = Math.round(hs);
          var tallH = Math.round(Math.max(ht, 2 * hs + g));
          short.forEach(function (c) {
            c.style.minHeight = shortH + 'px';
          });
          tall.forEach(function (c) {
            c.style.minHeight = tallH + 'px';
          });

          // Now compute row spans from final rendered heights.
          var effectiveGap = g;
          items.forEach(function (item) {
            var h = item.getBoundingClientRect().height;
            var span = Math.max(1, Math.ceil((h + effectiveGap) / (rowHeight + effectiveGap)));
            item.style.gridRowEnd = 'span ' + span;
          });
        },
        getSrcNumForAgent(agentNumber) {
          let result = '-';
          let answeredFound = false;
          for (const call of this.allCalls) {
            if (call.dst_num === agentNumber) {
              answeredFound = true;
              result = call.src_num;
              break;
            }
            if (call.calledChannels && Array.isArray(call.calledChannels)) {
              const match = call.calledChannels.find(ch => ch.number === agentNumber);
              if (match) {
                result = call.src_num;
              }
            }
            if (call.bridgeChannels && Array.isArray(call.bridgeChannels)) {
              const match = call.bridgeChannels.find(ch => ch.src_num === agentNumber || ch.dst_num === agentNumber);
              if (match) {
                if (match.src_num === agentNumber) {
                  result = match.dst_num;
                } else {
                  result = match.src_num;
                }
                answeredFound = true;
              }
            }
          }
          if (answeredFound === false) {
            for (let i = 0; i < this.allCalls.length; i++) {
              const tmpCall = this.allCalls[i];
              if (tmpCall.src_num === agentNumber) {
                // Исходящий
                if (tmpCall.dst_num === '') {
                  // не ответа, дозвон.
                  if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels) && tmpCall.calledChannels.length) {
                    const match = tmpCall.calledChannels.find(ch => ch.number !== agentNumber);
                    if (match) {
                      result = match.number;
                    }
                  } else if (tmpCall.spyer) {
                    // шпионит за номером.
                    result = tmpCall.spy_num;
                  } else {
                    // нет вызываемых каналов, возможно это вызов на приложение / ivr.
                    result = tmpCall.exten;
                  }
                } else {
                  result = tmpCall.dst_num;
                }
                break;
              } else if (tmpCall.dst_num === agentNumber) {
                // Входящий на агента, отвечен.
                result = tmpCall.src_num;
                break;
              } else {
                if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels)) {
                  const match = tmpCall.calledChannels.find(ch => ch.number === agentNumber);
                  if (match) {
                    result = tmpCall.src_num;
                  }
                }
              }
            }
          }
          return result;
        },
        hasPeerPhone(agentNumber) {
          const phone = String(this.getSrcNumForAgent(agentNumber) || '').trim();
          return phone !== '' && phone !== '-' && phone !== '—';
        },
        getPeerPhoneLabel(agentNumber) {
          const phone = String(this.getSrcNumForAgent(agentNumber) || '').trim();
          return this.hasPeerPhone(agentNumber) ? phone : '—';
        },
        getPeerNameLabel(agentNumber) {
          // Use cached contacts (WS + IndexedDB) to show client name for peer phone.
          const phone = this.getPeerPhoneLabel(agentNumber);
          const client = this.getClientNameByPhone(phone);
          return client || '—';
        }
      },
      data: {
        "minWaitVisible": 30,
        "nowTick": 0,
        "queues": {},
        "allCalls": [],
        "selectedQueueIds": [],
        "lastActiveCallsPayload": null,
        "contactsByPhone10": {}
      }
    });
    window[className].applyContactsCacheToQueueWidget();
    window[className].$callsWidget = new Vue({
      el: '#calls',
      delimiters: ["<%", "%>"],
      data: {
        "minWaitVisible": 30,
        "nowTick": 0,
        userNumber: userNumber,
        fullAccess: $('#fullAccess').val() === "1" || userNumber === '',
        calls: []
      },
      methods: {
        callIsVisible(call) {
          void this.nowTick;
          if (call.dst_chan === '' && call.queueData.EnterTime !== undefined) {
            return this.minWaitVisible <= this.getWaitTime(call);
          }
          return true;
        },
        formatTimestampToTime(timestamp) {
          // Если timestamp строка — приводим к числу
          const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;

          // Если timestamp в секундах (меньше 1e10), умножаем на 1000
          const ms = ts < 1e10 ? ts * 1000 : ts;
          const date = new Date(ms);
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${hours}:${minutes}:${seconds}`;
        },
        getWaitTime(call) {
          void this.nowTick;
          let answer = Math.floor(Date.now() / 1000);
          if (call.answer !== '') {
            answer = call.answer;
          }
          return window[className].secondToTime(answer - call.start);
        },
        getCallTime(call) {
          void this.nowTick;
          if (call.answer === '') {
            return '-';
          }
          return window[className].formatElapsedTime(call.answer);
        },
        updatedCallsFromResponse(data) {
          const payload = window[className].normalizeActiveCallsPayload(data);
          this.minWaitVisible = 1 * $('#minWaitVisibleValue').val();
          const calls = payload.calls.slice();
          // Проходим по всем очередям
          for (const queueId in payload.queues) {
            const queue = payload.queues[queueId];
            // Проверяем, есть ли у очереди поле calls и является ли оно массивом
            if (queue && Array.isArray(queue.calls)) {
              // Добавляем все вызовы из этой очереди в общий массив
              calls.push(...queue.calls);
            }
          }
          this.calls = calls;
          this.$nextTick(() => {
            Extensions.updatePhonesRepresent('need-update');
          });
        },
        formatElapsedTime(enterTime) {
          return window[className].formatElapsedTime(enterTime);
        },
        getClientHeader(phone) {
          const q = window[className].$widgetQueues;
          if (q && typeof q.getClientHeader === 'function') {
            return q.getClientHeader(phone);
          }
          return phone;
        },
        hangupAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          window[className].executeCallAction({
            action: 'hangup',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2')
          });
        },
        joinAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'join',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        },
        whisperAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          let spChannel = target.attr('data-ch1');
          if ('incoming' === target.attr('data-call-type')) {
            spChannel = target.attr('data-ch2');
          }
          window[className].executeCallAction({
            action: 'whisper',
            ch1: spChannel,
            ch2: '',
            number: this.userNumber
          });
        },
        listenAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'listen',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        }
      }
    });
    window[className].$widget = new Vue({
      el: '#app',
      delimiters: ["<%", "%>"],
      data: {
        userNumber: userNumber,
        fullAccess: $('#fullAccess').val() === "1" || userNumber === '',
        calls: []
      },
      methods: {
        updatedCallsFromResponse(lines) {
          this.calls = lines;
          this.$nextTick(() => {
            Extensions.updatePhonesRepresent('need-update');
          });
        },
        hangupAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          window[className].executeCallAction({
            action: 'hangup',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2')
          });
        },
        joinAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'join',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        },
        whisperAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          let spChannel = target.attr('data-ch1');
          if ('incoming' === target.attr('data-call-type')) {
            spChannel = target.attr('data-ch2');
          }
          window[className].executeCallAction({
            action: 'whisper',
            ch1: spChannel,
            ch2: '',
            number: this.userNumber
          });
        },
        listenAction(event) {
          let target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'listen',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        }
      }
    });
    window[className].$checkBoxes.checkbox();
    window[className].$dropDowns.dropdown();
    window[className].initializeForm();
    $('.menu .item').tab();
    window[className].startUiTicker();
    window[className].startActiveCallsWsWatchdog();
    //////
    // Удаляем отступы контейнера.
    $('#main-content-container').removeClass('container');
    $('#module-status-toggle-segment').hide();
    $('.ui.clearing.hidden.divider').remove();
    // Окончание форматирования базовой страницы
    //////
    this.startPollingActiveCalls();
    this.requestBackendEnable();

    // Allow settings to be saved after initialization
    setTimeout(function () {
      window[className].isInit = false;
    }, 1000);
  },
  startUiTicker() {
    if (this._uiTicker) return;
    this._uiTicker = setInterval(() => {
      const now = Date.now();
      if (window[className].$widgetQueues) {
        window[className].$widgetQueues.nowTick = now;
      }
      if (window[className].$callsWidget) {
        window[className].$callsWidget.nowTick = now;
      }
    }, 1000);
  },
  startPollingActiveCalls() {
    if (this._activeCallsPollTimer) return;
    window[className].updateLines();
    this._activeCallsPollTimer = setInterval(window[className].updateLines, 2000);
  },
  stopPollingActiveCalls() {
    if (!this._activeCallsPollTimer) return;
    clearInterval(this._activeCallsPollTimer);
    this._activeCallsPollTimer = null;
  },
  startActiveCallsWsWatchdog() {
    if (this._activeCallsWsWatchdogTimer) return;
    this._activeCallsWsWatchdogTimer = setInterval(() => {
      this.checkActiveCallsWsLiveness();
    }, 2000);
  },
  checkActiveCallsWsLiveness() {
    if (this._backendTransport === 'polling') return;
    if (!this._activeCallsWs || this._activeCallsWs.readyState !== WebSocket.OPEN) {
      this.startPollingActiveCalls();
      return;
    }
    if (!this._activeCallsWsLastMessageAt) {
      // Keep the initial polling fallback until the first valid WS payload.
      this.startPollingActiveCalls();
      return;
    }
    if (Date.now() - this._activeCallsWsLastMessageAt > this.activeCallsWsSilenceTimeoutMs) {
      this.startPollingActiveCalls();
    }
  },
  async initContactsCache() {
    try {
      this._contactsCacheByPhone10 = await this.idbLoadAllContacts();
      this.applyContactsCacheToQueueWidget();
    } catch (e) {
      console.log('contacts cache init error', e);
      this._contactsCacheByPhone10 = {};
    }
  },
  applyContactsCacheToQueueWidget() {
    if (!this._contactsCacheByPhone10) return;
    if (!window[className].$widgetQueues) return;
    for (const [phone10, client] of Object.entries(this._contactsCacheByPhone10)) {
      if (window[className].$widgetQueues.$set) {
        window[className].$widgetQueues.$set(window[className].$widgetQueues.contactsByPhone10, phone10, client);
      } else {
        window[className].$widgetQueues.contactsByPhone10[phone10] = client;
      }
    }
  },
  idbOpenContactsDb() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open('ModuleMonitorActiveCalls', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('contactsByPhone10')) {
            db.createObjectStore('contactsByPhone10', {
              keyPath: 'phone10'
            });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  },
  async idbPutContact(phone10, client) {
    const db = await this.idbOpenContactsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contactsByPhone10', 'readwrite');
      const store = tx.objectStore('contactsByPhone10');
      store.put({
        phone10,
        client,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        const err = tx.error;
        db.close();
        reject(err);
      };
    });
  },
  async idbLoadAllContacts() {
    const db = await this.idbOpenContactsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contactsByPhone10', 'readwrite');
      const store = tx.objectStore('contactsByPhone10');
      const req = store.getAll();
      req.onsuccess = () => {
        const map = {};
        const now = Date.now();
        const ttlMs = Number(this.contactsCacheTtlMs) || 120 * 60 * 1000;
        for (const row of req.result || []) {
          const phone10 = row?.phone10;
          const client = row?.client;
          const updatedAt = Number(row?.updatedAt) || 0;
          const isFresh = phone10 && client && updatedAt > 0 && now - updatedAt <= ttlMs;
          if (isFresh) {
            map[phone10] = client;
          } else if (phone10) {
            // Cleanup expired/broken records
            try {
              store.delete(phone10);
            } catch (e) {/* ignore */}
          }
        }
        tx.oncomplete = () => {
          db.close();
          resolve(map);
        };
        tx.onerror = () => {
          const err = tx.error;
          db.close();
          reject(err);
        };
      };
      req.onerror = () => {
        const err = req.error;
        db.close();
        reject(err);
      };
    });
  },
  requestBackendEnable() {
    $.api({
      url: window[className].backendEnableUrl,
      on: 'now',
      method: 'POST',
      onSuccess(response) {
        window[className].applyBackendSession(response?.data || {});
      },
      onFailure(response) {
        console.log('backandEnable failure', response);
        window[className].startPollingActiveCalls();
      },
      onError(errorMessage, element, xhr) {
        console.log('backandEnable error', errorMessage, xhr);
        window[className].startPollingActiveCalls();
      }
    });
  },
  applyBackendSession(data) {
    const transport = String(data?.transport || 'polling');
    this._backendTransport = transport;
    this._backendRoutes = data?.routes && typeof data.routes === 'object' ? data.routes : {};
    const accessToken = data?.access_token;
    if (transport === 'polling' || !accessToken) {
      this._authTokens = {};
      this.invalidateActiveCallsWs();
      this.startPollingActiveCalls();
      return;
    }
    this.setAuthTokens(accessToken, data?.refresh_token || '', Number(data?.expires_in) || 3600);
    this.connectContactsWs();
    this.connectActiveCallsWs();
  },
  setAuthTokens(accessToken, refreshToken, expiresIn = 3600) {
    this._authTokens = this._authTokens || {};
    this._authTokens.access_token = accessToken;
    this._authTokens.refresh_token = refreshToken;
    this._authTokens.exp = this.getJwtExp(accessToken) || Math.floor(Date.now() / 1000) + Math.max(1, Number(expiresIn) || 3600);
  },
  invalidateActiveCallsWs() {
    const socket = this._activeCallsWs;
    this._activeCallsWs = null;
    this._activeCallsWsLastMessageAt = 0;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch (e) {
      // The socket is already unusable; polling remains the fallback.
    }
  },
  refreshAuthToken() {
    this.requestBackendEnable();
  },
  getJwtExp(token) {
    try {
      if (!token || typeof token !== 'string') return 0;
      const parts = token.split('.');
      if (parts.length < 2) return 0;
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
      const json = atob(padded);
      const payload = JSON.parse(json);
      return Number(payload?.exp) || 0;
    } catch (e) {
      return 0;
    }
  },
  isAccessTokenExpired(skewSeconds = 0) {
    const exp = Number(this._authTokens?.exp) || 0;
    if (!exp) return false; // unknown exp -> don't force refresh
    const now = Math.floor(Date.now() / 1000);
    return now + skewSeconds >= exp;
  },
  scheduleContactsWsTokenRefresh() {
    if (this._contactsWsTokenTimer) {
      clearTimeout(this._contactsWsTokenTimer);
      this._contactsWsTokenTimer = null;
    }
    const exp = Number(this._authTokens?.exp) || 0;
    if (!exp) return;
    const now = Math.floor(Date.now() / 1000);
    const refreshInSec = Math.max(1, exp - now - 15); // 15s before exp
    this._contactsWsTokenTimer = setTimeout(() => {
      this.refreshAuthToken();
    }, refreshInSec * 1000);
  },
  scheduleContactsWsReconnect(reason, forceReAuth = false) {
    if (this._backendTransport === 'polling' || !this._backendRoutes?.contacts) return;
    if (this._contactsWsReconnectTimer) {
      clearTimeout(this._contactsWsReconnectTimer);
      this._contactsWsReconnectTimer = null;
    }
    this._contactsWsReconnectAttempt = (this._contactsWsReconnectAttempt || 0) + 1;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, this._contactsWsReconnectAttempt - 1)));
    this._contactsWsReconnectTimer = setTimeout(() => {
      if (forceReAuth || this.isAccessTokenExpired(5)) {
        this.requestBackendEnable();
      } else {
        this.connectContactsWs();
      }
    }, delay);
    console.log('contacts ws reconnect scheduled', {
      reason,
      delayMs: delay
    });
  },
  connectContactsWs() {
    try {
      const accessToken = this._authTokens?.access_token;
      const route = String(this._backendRoutes?.contacts || '').trim();
      if (!accessToken || !route || this._backendTransport === 'polling') return;

      // Avoid reconnecting if already connected/connecting
      if (this._contactsWs && (this._contactsWs.readyState === WebSocket.OPEN || this._contactsWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      // Reset backoff on explicit connect attempt
      this._contactsWsReconnectAttempt = 0;
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsHost = window.location.host; // host:port of current page
      const tokenParam = encodeURIComponent(accessToken);
      const wsUrl = `${wsProto}://${wsHost}${route}?authorization=${tokenParam}`;
      this._contactsWs = new WebSocket(wsUrl);
      this._contactsWs.onopen = () => {
        console.log('contacts ws connected');
        this.scheduleContactsWsTokenRefresh();
      };
      this._contactsWs.onmessage = event => {
        this.handleContactsWsMessage(event?.data);
      };
      this._contactsWs.onerror = event => {
        console.log('contacts ws error', event);
      };
      this._contactsWs.onclose = event => {
        const code = event?.code;
        const reason = event?.reason;
        console.log('contacts ws closed', {
          code,
          reason
        });
        if (this._contactsWsTokenTimer) {
          clearTimeout(this._contactsWsTokenTimer);
          this._contactsWsTokenTimer = null;
        }

        // 1000 = normal close -> reconnect; auth closes vary by server implementation.
        const authCloseCodes = new Set([1008, 4001, 4401, 4403]);
        const forceReAuth = authCloseCodes.has(code) || this.isAccessTokenExpired(0);
        this.scheduleContactsWsReconnect('close', forceReAuth);
      };
    } catch (e) {
      console.log('contacts ws init error', e);
      this.scheduleContactsWsReconnect('init_error', this.isAccessTokenExpired(0));
    }
  },
  scheduleActiveCallsWsReconnect(reason, forceReAuth = false) {
    if (this._backendTransport === 'polling' || !this._backendRoutes?.active_calls) {
      this.startPollingActiveCalls();
      return;
    }
    if (this._activeCallsWsReconnectTimer) {
      clearTimeout(this._activeCallsWsReconnectTimer);
      this._activeCallsWsReconnectTimer = null;
    }
    this._activeCallsWsReconnectAttempt = (this._activeCallsWsReconnectAttempt || 0) + 1;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, this._activeCallsWsReconnectAttempt - 1)));
    this._activeCallsWsReconnectTimer = setTimeout(() => {
      if (forceReAuth || this.isAccessTokenExpired(5)) {
        this.requestBackendEnable();
      } else {
        this.connectActiveCallsWs();
      }
    }, delay);
    console.log('active-calls ws reconnect scheduled', {
      reason,
      delayMs: delay
    });
  },
  connectActiveCallsWs() {
    try {
      const accessToken = this._authTokens?.access_token;
      const route = String(this._backendRoutes?.active_calls || '').trim();
      if (!accessToken || !route || this._backendTransport === 'polling') {
        this.startPollingActiveCalls();
        return;
      }

      // Avoid reconnecting if already connected/connecting
      if (this._activeCallsWs && (this._activeCallsWs.readyState === WebSocket.OPEN || this._activeCallsWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      // Reset backoff on explicit connect attempt
      this._activeCallsWsReconnectAttempt = 0;
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsHost = window.location.host; // host:port of current page
      const tokenParam = encodeURIComponent(accessToken);
      const wsUrl = `${wsProto}://${wsHost}${route}?authorization=${tokenParam}`;
      const socket = new WebSocket(wsUrl);
      this._activeCallsWs = socket;
      this._activeCallsWsLastMessageAt = 0;
      socket.onopen = () => {
        console.log('active-calls ws connected');
        // Reuse the same token refresh timer (it triggers requestBackendEnable)
        this.scheduleContactsWsTokenRefresh();
      };
      socket.onmessage = event => {
        if (this._activeCallsWs !== socket || this._backendTransport === 'polling') return;
        this.handleActiveCallsWsMessage(event?.data);
      };
      socket.onerror = event => {
        if (this._activeCallsWs !== socket) return;
        console.log('active-calls ws error', event);
        this.startPollingActiveCalls();
        this.scheduleActiveCallsWsReconnect('error', this.isAccessTokenExpired(0));
      };
      socket.onclose = event => {
        if (this._activeCallsWs !== socket) return;
        const code = event?.code;
        const reason = event?.reason;
        console.log('active-calls ws closed', {
          code,
          reason
        });
        this._activeCallsWs = null;
        this._activeCallsWsLastMessageAt = 0;
        this.startPollingActiveCalls();

        // Auth closes vary by server implementation.
        const authCloseCodes = new Set([1008, 4001, 4401, 4403]);
        const forceReAuth = authCloseCodes.has(code) || this.isAccessTokenExpired(0);
        this.scheduleActiveCallsWsReconnect('close', forceReAuth);
      };
    } catch (e) {
      console.log('active-calls ws init error', e);
      this.startPollingActiveCalls();
      this.scheduleActiveCallsWsReconnect('init_error', this.isAccessTokenExpired(0));
    }
  },
  handleContactsWsMessage(data) {
    try {
      if (!data) return;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const digits = String(item?.number || '').replace(/\D+/g, '');
        const phone10 = digits.length <= 10 ? digits : digits.slice(-10);
        const displayName = String(item?.client || item?.contact || '').trim();
        if (phone10 && displayName) {
          this._contactsCacheByPhone10 = this._contactsCacheByPhone10 || {};
          this._contactsCacheByPhone10[phone10] = displayName;
          this.idbPutContact(phone10, displayName).catch(e => console.log('contacts cache save error', e));
        }
        if (window[className].$widgetQueues) {
          window[className].$widgetQueues.updateContactFromWs(item);
        }
        // Calls table is a separate Vue instance and reads client name via $widgetQueues.
        // Vue can't track cross-instance dependency, so force re-render on contact update.
        if (window[className].$callsWidget && typeof window[className].$callsWidget.$forceUpdate === 'function') {
          window[className].$callsWidget.$forceUpdate();
        }
      }
    } catch (e) {
      console.log('contacts ws parse error', e);
    }
  },
  handleActiveCallsWsMessage(data) {
    try {
      if (!data) return;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const payload = parsed?.queues ? parsed : parsed?.data?.queues ? parsed.data : null;
      if (!payload || !Array.isArray(payload.calls) || !payload.queues || typeof payload.queues !== 'object' || Array.isArray(payload.queues)) return;
      if (!window[className].$widgetQueues || !window[className].$callsWidget) return;
      window[className].$widgetQueues.updatedCallsFromResponse(payload);
      window[className].$callsWidget.updatedCallsFromResponse(payload);
      this._activeCallsWsLastMessageAt = Date.now();
      this.stopPollingActiveCalls();
    } catch (e) {
      console.log('active-calls ws parse error', e);
    }
  },
  formatElapsedTime(enterTime) {
    if (!enterTime) return '—';
    const now = Math.floor(Date.now() / 1000);
    const diffSeconds = now - enterTime;
    return window[className].secondToTime(diffSeconds);
  },
  secondToTime(diffSeconds) {
    if (diffSeconds < 0) return '0';
    // Форматируем: чч:мм:сс или мм:сс, или просто секунды
    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor(diffSeconds % 3600 / 60);
    const seconds = Math.round(diffSeconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${seconds}`;
    }
  },
  onChangeSetting(settingName, value) {
    if (window[className].isInit) {
      return;
    }
    var data = {};
    data[settingName] = value;
    $.api({
      url: window[className].saveUserActionUrl,
      on: 'now',
      method: 'POST',
      data: data,
      successTest: function (response) {
        return response !== undefined && Object.keys(response).length > 0 && response.success === true;
      },
      onSuccess: function (response) {
        if (settingName === 'queueIds') {
          // Update hidden input and Vue data
          $('#queueIds').val(value);
          // Re-render queue widget from last received payload (WS mode)
          if (window[className].$widgetQueues && typeof window[className].$widgetQueues.refreshFromLastPayload === 'function') {
            window[className].$widgetQueues.refreshFromLastPayload();
          }
        } else if (settingName === 'adminUserId') {
          window.location.href = window.location.href;
        }
      },
      onFailure: function (response) {
        console.log(response);
      },
      onError: function (errorMessage, element, xhr) {
        console.log(errorMessage, xhr);
      }
    });
  },
  executeCallAction(data) {
    $.api({
      url: window[className].executeCallUrl,
      on: 'now',
      method: 'POST',
      data: data,
      successTest(response) {
        return response !== undefined && Object.keys(response).length > 0 && response.success === true;
      },
      onSuccess(response) {
        console.log(response);
      },
      onFailure(response) {
        console.log(response);
      },
      onError(errorMessage, element, xhr) {
        console.log(errorMessage, xhr);
      }
    });
  },
  updateLines() {
    $.api({
      url: window[className].activeChannelsUrlV2,
      on: 'now',
      method: 'POST',
      successTest(response) {
        return response !== undefined && Object.keys(response).length > 0 && response.success === true;
      },
      onSuccess(response) {
        window[className].$widgetQueues.updatedCallsFromResponse(response);
        window[className].$callsWidget.updatedCallsFromResponse(response);
      },
      onFailure(response) {
        console.log(response);
      },
      onError(errorMessage, element, xhr) {
        console.log(errorMessage, xhr);
      }
    });
  },
  /**
   * We can modify some data before form send
   * @param settings
   * @returns {*}
   */
  cbBeforeSendForm(settings) {
    const result = settings;
    result.data = window[className].$formObj.form('get values');
    return result;
  },
  /**
   * Some actions after forms send
   */
  cbAfterSendForm() {},
  /**
   * Initialize form parameters
   */
  initializeForm() {
    Form.$formObj = window[className].$formObj;
    Form.url = `${globalRootUrl}${idUrl}/save`;
    Form.validateRules = window[className].validateRules;
    Form.cbBeforeSendForm = window[className].cbBeforeSendForm;
    Form.cbAfterSendForm = window[className].cbAfterSendForm;
    Form.initialize();
  }
};
window[className] = ModuleMonitorActiveCalls;
$(document).ready(() => {
  window[className].initialize();
});

//# sourceMappingURL=module-monitor-active-calls-index.js.map