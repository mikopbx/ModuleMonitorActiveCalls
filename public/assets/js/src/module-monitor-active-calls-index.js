/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */
const idUrl     = 'module-monitor-active-calls';
const idForm    = 'module-monitor-active-calls-form';
const className = 'ModuleMonitorActiveCalls';
const inputClassName = 'mikopbx-module-input';

/* global $, globalRootUrl, globalTranslate, Form, Config, Vue, Extensions */
const ModuleMonitorActiveCalls = {
	isInit: true,
	contactsCacheTtlMs: 120 * 60 * 1000,
	queueNameSelector: '#app-queue div.scrolling.dropdown',
	$formObj: $('#'+idForm),
	$checkBoxes: $('#'+idForm+' .ui.checkbox'),
	$dropDowns: $('#'+idForm+' .ui.dropdown'),
	activeChannelsUrl: globalRootUrl + idUrl + "/getActiveChannels",
	activeChannelsUrlV2: globalRootUrl + idUrl + "/getActiveChannelsV2",
	backendEnableUrl: globalRootUrl + idUrl + "/backandEnable",
	executeCallUrl: globalRootUrl + idUrl + "/executeCall",
	saveUserActionUrl: globalRootUrl + idUrl + "/saveUser",
	$widget: undefined,

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
		this.requestBackendEnable();

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
			delimiters: ["<%","%>"],
			methods: {
				updatedCallsFromResponse(data) {
					// Keep last payload to allow re-render on queue switch (WS mode).
					this.lastActiveCallsPayload = data;

					let queueNameEl = $(window[className].queueNameSelector);
					this.minWaitVisible = 1*$('#minWaitVisibleValue').val();

					this.queues = data.queues;
					this.allCalls = data.calls;
					let queueId = $('#queueId').val();
					if (queueId in data.queues) {
						this.id     = data.queues[queueId].id;
						this.name   = data.queues[queueId].name;
						this.number = data.queues[queueId].number;
						this.agents = data.queues[queueId].agents;
						this.agentsList = this.buildAgentsList(this.agents);
						this.calls  = Array.isArray(data.queues[queueId].calls) ? data.queues[queueId].calls : [];
					}else{
						this.calls  = [];
						this.agentsList = [];
					}
					if(queueNameEl.dropdown('is hidden')){
						queueNameEl.dropdown({
							onChange: function onChange(value, text, $choice) {
								window[className].onChangeSetting('queueId', value);
							}
						});
						if(queueNameEl.dropdown('get value') === ''){
							window[className].isInit = true;
							queueNameEl.dropdown('set value', $('#queueId').val())
							window[className].isInit = false;
						}
					}

					// Normalize Semantic UI Card typography after render
					this.$nextTick(() => {
						this.normalizeAgentCards();
					});
				},
				refreshFromLastPayload() {
					if (this.lastActiveCallsPayload) {
						this.updatedCallsFromResponse(this.lastActiveCallsPayload);
					}
				},
				buildAgentsList(agentsObj) {
					const entries = Object.entries(agentsObj || {});
					const available = [];
					const unavailable = [];
					for (const [number, agent] of entries) {
						const state = agent?.state || '';
						const item = { number, ...agent };
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
					const client = String(contact?.client || '').trim();
					if (!client) return;
					// Vue2: ensure reactivity for new keys
					if (this.$set) {
						this.$set(this.contactsByPhone10, phone10, client);
					} else {
						this.contactsByPhone10[phone10] = client;
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

					// Cleanup artifacts from previous experiments (placeholders/spacers).
					const artifacts = this.$el.querySelectorAll('.agent-peer-placeholder, .agent-peer-spacer');
					artifacts.forEach((el) => el.remove());

					// Dense layout (masonry) that still fills left-to-right:
					// flex-wrap can't place items into vertical gaps under tall cards.
					this.ensureAgentCardsGridMasonry();

					// Prevent "equal height" cards in one row (Semantic UI cards are flex).
					const cardsContainer = this.$el.querySelector('.ui.cards.agent-cards');
					if (cardsContainer) {
						cardsContainer.style.alignItems = 'flex-start';
						cardsContainer.style.alignContent = 'flex-start';
					}

					const cards = this.$el.querySelectorAll('.ui.cards.agent-cards > .ui.card.agent-card');
					cards.forEach((card) => {
						card.style.alignSelf = 'flex-start';
					});

					// Semantic UI makes .header bigger than normal text; we need same font size.
					const headers = this.$el.querySelectorAll('.ui.card.agent-card .header.agent-card-header');
					headers.forEach((el) => {
						el.style.fontSize = '1em';
						el.style.lineHeight = '1.2';
						el.style.display = 'flex';
						el.style.alignItems = 'center';
						el.style.gap = '0.5em';
						el.style.whiteSpace = 'nowrap';
					});

					const metas = this.$el.querySelectorAll('.ui.card.agent-card .meta.agent-peer');
					metas.forEach((el) => {
						el.style.fontSize = '1em';
						el.style.lineHeight = '1.2';
					});

					// Normalize label/name typography so they have same text height.
					const numLabels = this.$el.querySelectorAll('.ui.card.agent-card .agent-num-label');
					numLabels.forEach((el) => {
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
					const names = this.$el.querySelectorAll('.ui.card.agent-card .agent-name');
					names.forEach((el) => {
						el.style.lineHeight = '1.2';
						// Ellipsis for long names (e.g. "Салтыков-Щедрин")
						el.style.minWidth = '0';
						el.style.flex = '1 1 auto';
						el.style.overflow = 'hidden';
						el.style.textOverflow = 'ellipsis';
						el.style.whiteSpace = 'nowrap';
					});

					// Grid masonry needs row-span calculation after layout.
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							this.layoutAgentCardsGridMasonry();
						});
					});
				},
				adjustAgentCardsGap() {
					if (!this.$el) return;
					const container = this.$el.querySelector('.ui.cards.agent-cards');
					if (!container) return;

					const cards = Array.from(container.querySelectorAll('.ui.card.agent-card'));
					if (!cards.length) return;

					const tallCard = cards.find((c) => c.querySelector('.meta.agent-peer'));
					const shortCard = cards.find((c) => !c.querySelector('.meta.agent-peer'));
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
					const styleId = 'agent-cards-layout-style';
					let styleEl = document.getElementById(styleId);
					if (!styleEl) {
						styleEl = document.createElement('style');
						styleEl.id = styleId;
						document.head.appendChild(styleEl);
					}

					// Grid masonry: fills left-to-right and can pack items into gaps.
					styleEl.textContent = `
.ui.cards.agent-cards.agent-cards-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, 240px);
  justify-content: start;
  gap: var(--agent-card-gap, 8px);
  grid-auto-rows: 1px;
  /* Prevent overlap with the legend block below */
  margin-bottom: 1em !important;
}
.ui.cards.agent-cards.agent-cards-grid > .ui.card.agent-card {
  width: 240px !important;
  margin: 0 !important;
  overflow: hidden;
  /* reset from previous layouts */
  align-self: start;
}
					`.trim();

					const cardsContainer = this.$el && this.$el.querySelector
						? this.$el.querySelector('.ui.cards.agent-cards')
						: null;
					if (cardsContainer) {
						cardsContainer.classList.remove('agent-cards-masonry');
						cardsContainer.classList.remove('agent-cards-flex');
						cardsContainer.classList.add('agent-cards-grid');

						// Bind once: relayout on resize.
						if (!this._agentCardsResizeBound) {
							this._agentCardsResizeBound = true;
							window.addEventListener('resize', () => {
								this.layoutAgentCardsGridMasonry();
							});
						}
					}
				},
				layoutAgentCardsGridMasonry() {
					if (!this.$el) return;
					const grid = this.$el.querySelector('.ui.cards.agent-cards.agent-cards-grid');
					if (!grid) return;

					const cs = window.getComputedStyle(grid);
					const rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 1;
					const rowGap = parseFloat(cs.getPropertyValue('row-gap')) || parseFloat(cs.getPropertyValue('gap')) || 8;

					const items = Array.from(grid.querySelectorAll('.ui.card.agent-card'));
					if (!items.length) return;

					// Reset row spans and min-heights to measure natural heights.
					items.forEach((item) => {
						item.style.gridRowEnd = '';
						item.style.minHeight = '';
					});

					const tall = items.filter((c) => c.querySelector('.meta.agent-peer'));
					const short = items.filter((c) => !c.querySelector('.meta.agent-peer'));

					// If we don't have both types, just do normal masonry spans.
					if (!tall.length || !short.length) {
						items.forEach((item) => {
							const h = item.getBoundingClientRect().height;
							const span = Math.max(1, Math.ceil((h + rowGap) / (rowHeight + rowGap)));
							item.style.gridRowEnd = `span ${span}`;
						});
						return;
					}

					const hs = Math.max(...short.map((c) => c.getBoundingClientRect().height));
					const ht = Math.max(...tall.map((c) => c.getBoundingClientRect().height));

					// Want: 2*(hs + g) = (ht + g)  => g = ht - 2*hs
					let g = ht - 2 * hs;
					if (!Number.isFinite(g)) g = rowGap;
					g = Math.max(0, Math.min(24, Math.round(g)));

					// Apply gap and enforce min-heights so the relation holds visually.
					grid.style.setProperty('--agent-card-gap', `${g}px`);

					const shortH = Math.round(hs);
					const tallH = Math.round(Math.max(ht, 2 * hs + g));
					short.forEach((c) => { c.style.minHeight = `${shortH}px`; });
					tall.forEach((c) => { c.style.minHeight = `${tallH}px`; });

					// Now compute row spans from final rendered heights.
					const effectiveGap = g;
					items.forEach((item) => {
						const h = item.getBoundingClientRect().height;
						const span = Math.max(1, Math.ceil((h + effectiveGap) / (rowHeight + effectiveGap)));
						item.style.gridRowEnd = `span ${span}`;
					});
				},
				getSrcNumForAgent(agentNumber) {
					let result = '-';
					let answeredFound  = false;
					for (const call of this.calls) {
						if(call.dst_num === agentNumber){
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
							const match = call.bridgeChannels.find(ch => (ch.src_num === agentNumber || ch.dst_num === agentNumber));
							if (match) {
								if(match.src_num === agentNumber){
									result = match.dst_num;
								}else{
									result = match.src_num;
								}
								answeredFound = true;
							}
						}
					}
					if(answeredFound === false){
						for (let i = 0; i < this.allCalls.length; i++) {
							const tmpCall = this.allCalls[i];
							if(tmpCall.src_num === agentNumber){
								// Исходящий
								if(tmpCall.dst_num === ''){
									// не ответа, дозвон.
									if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels) &&  tmpCall.calledChannels.length) {
										const match = tmpCall.calledChannels.find(ch => ch.number !== agentNumber);
										if (match) {
											result = match.number;
										}
									}else if(tmpCall.spyer){
										// шпионит за номером.
										result = tmpCall.spy_num;
									}else{
										// нет вызываемых каналов, возможно это вызов на приложение / ivr.
										result = tmpCall.exten;
									}
								}else{
									result = tmpCall.dst_num;
								}
								break;
							}else if(tmpCall.dst_num === agentNumber){
								// Входящий на агента, отвечен.
								result = tmpCall.src_num;
								break;
							}else{
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
				"name": "",
				"number": "",
				"queues": [],
				"agents": {
				},
				"agentsList": [],
				"lastActiveCallsPayload": null,
				"contactsByPhone10": {},
				"calls": [
				]
			},
		});
		window[className].applyContactsCacheToQueueWidget();

		window[className].$callsWidget = new Vue({
			el: '#calls',
			delimiters: ["<%","%>"],
			data: {
				"minWaitVisible": 30,
				"nowTick": 0,
				userNumber: userNumber,
				fullAccess: ($('#fullAccess').val() === "1" || userNumber === ''),
				calls: [
				]
			},
			methods: {
				callIsVisible(call){
					void this.nowTick;
					if(call.dst_chan==='' && call.queueData.EnterTime !== undefined ){
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
				getWaitTime(call){
					void this.nowTick;
					let answer = Math.floor(Date.now() / 1000);
					if(call.answer !== ''){
						answer = call.answer
					}
					return window[className].secondToTime(answer - call.start);
				},
				getCallTime(call){
					void this.nowTick;
					if(call.answer === ''){
						return '-';
					}
					return window[className].formatElapsedTime(call.answer);
				},
				updatedCallsFromResponse(data) {
					this.minWaitVisible = 1*$('#minWaitVisibleValue').val();
					// Проходим по всем очередям
					for (const queueId in data.queues) {
						const queue = data.queues[queueId];
						// Проверяем, есть ли у очереди поле calls и является ли оно массивом
						if (Array.isArray(queue.calls)) {
							// Добавляем все вызовы из этой очереди в общий массив
							data.calls.push(...queue.calls);
						}
					}
					this.calls = data.calls;
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
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					window[className].executeCallAction({action: 'hangup', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2')});
				},
				joinAction(event) {
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'join', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				},
				whisperAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					let spChannel = target.attr('data-ch1');
					if('incoming' === target.attr('data-call-type')){
						spChannel = target.attr('data-ch2');
					}
					window[className].executeCallAction({action: 'whisper', ch1: spChannel, ch2: '', number: this.userNumber});
				},
				listenAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'listen', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				}
			}
		});

		window[className].$widget = new Vue({
			el: '#app',
			delimiters: ["<%","%>"],
			data: {
				userNumber: userNumber,
				fullAccess: ($('#fullAccess').val() === "1" || userNumber === ''),
				calls: [
				]
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
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					window[className].executeCallAction({action: 'hangup', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2')});
				},
				joinAction(event) {
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'join', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				},
				whisperAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					let spChannel = target.attr('data-ch1');
					if('incoming' === target.attr('data-call-type')){
						spChannel = target.attr('data-ch2');
					}
					window[className].executeCallAction({action: 'whisper', ch1: spChannel, ch2: '', number: this.userNumber});
				},
				listenAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'listen', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				}
			}
		});
		window[className].$checkBoxes.checkbox();
		window[className].$dropDowns.dropdown();
		window[className].initializeForm();
		$('.menu .item').tab();
		window[className].startUiTicker();
		//////
		// Удаляем отступы контейнера.
		$('#main-content-container').removeClass('container');
		$('#module-status-toggle-segment').hide();
		$('.ui.clearing.hidden.divider').remove();
		// Окончание форматирования базовой страницы
		//////
		this.startPollingActiveCalls();
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
						db.createObjectStore('contactsByPhone10', { keyPath: 'phone10' });
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
			store.put({ phone10, client, updatedAt: Date.now() });
			tx.oncomplete = () => { db.close(); resolve(); };
			tx.onerror = () => { const err = tx.error; db.close(); reject(err); };
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
				const ttlMs = Number(this.contactsCacheTtlMs) || (120 * 60 * 1000);
				for (const row of req.result || []) {
					const phone10 = row?.phone10;
					const client = row?.client;
					const updatedAt = Number(row?.updatedAt) || 0;
					const isFresh = phone10 && client && updatedAt > 0 && (now - updatedAt) <= ttlMs;
					if (isFresh) {
						map[phone10] = client;
					} else if (phone10) {
						// Cleanup expired/broken records
						try { store.delete(phone10); } catch (e) { /* ignore */ }
					}
				}
				tx.oncomplete = () => { db.close(); resolve(map); };
				tx.onerror = () => { const err = tx.error; db.close(); reject(err); };
			};
			req.onerror = () => { const err = req.error; db.close(); reject(err); };
		});
	},
	requestBackendEnable() {
		$.api({
			url: window[className].backendEnableUrl,
			on: 'now',
			method: 'POST',
			onSuccess(response) {
				console.log('backandEnable response', response);
				const accessToken = response?.data?.access_token;
				const refreshToken = response?.data?.refresh_token;
				if (accessToken && refreshToken) {
					window[className].setAuthTokens(accessToken, refreshToken);
					window[className].connectContactsWs();
					window[className].connectActiveCallsWs();
				}
			},
			onFailure(response) {
				console.log('backandEnable failure', response);
			},
			onError(errorMessage, element, xhr) {
				console.log('backandEnable error', errorMessage, xhr);
			}
		});
	},
	setAuthTokens(accessToken, refreshToken) {
		this._authTokens = this._authTokens || {};
		this._authTokens.access_token = accessToken;
		this._authTokens.refresh_token = refreshToken;
		this._authTokens.exp = this.getJwtExp(accessToken);
	},
	getJwtExp(token) {
		try {
			if (!token || typeof token !== 'string') return 0;
			const parts = token.split('.');
			if (parts.length < 2) return 0;
			const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
			const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
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
		// Proactively refresh token shortly before expiry by re-requesting backendEnable.
		if (this._contactsWsTokenTimer) {
			clearTimeout(this._contactsWsTokenTimer);
			this._contactsWsTokenTimer = null;
		}
		const exp = Number(this._authTokens?.exp) || 0;
		if (!exp) return;
		const now = Math.floor(Date.now() / 1000);
		const refreshInSec = Math.max(1, exp - now - 15); // 15s before exp
		this._contactsWsTokenTimer = setTimeout(() => {
			// Re-get tokens and reconnect WS
			this.requestBackendEnable();
		}, refreshInSec * 1000);
	},
	scheduleContactsWsReconnect(reason, forceReAuth = false) {
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
		console.log('contacts ws reconnect scheduled', { reason, delayMs: delay });
	},
	connectContactsWs() {
		try {
			const accessToken = this._authTokens?.access_token;
			if (!accessToken) return;

			// Avoid reconnecting if already connected/connecting
			if (this._contactsWs && (this._contactsWs.readyState === WebSocket.OPEN || this._contactsWs.readyState === WebSocket.CONNECTING)) {
				return;
			}
			// Reset backoff on explicit connect attempt
			this._contactsWsReconnectAttempt = 0;

			const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
			const wsHost = window.location.host; // host:port of current page
			const tokenParam = encodeURIComponent(accessToken);
			const wsUrl = `${wsProto}://${wsHost}/pbxcore/api/module-softphone-backend/v1/sub/contacts?authorization=${tokenParam}`;

			this._contactsWs = new WebSocket(wsUrl);
			this._contactsWs.onopen = () => {
				console.log('contacts ws connected');
				this.scheduleContactsWsTokenRefresh();
			};
			this._contactsWs.onmessage = (event) => {
				this.handleContactsWsMessage(event?.data);
			};
			this._contactsWs.onerror = (event) => {
				console.log('contacts ws error', event);
			};
			this._contactsWs.onclose = (event) => {
				const code = event?.code;
				const reason = event?.reason;
				console.log('contacts ws closed', { code, reason });

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
		console.log('active-calls ws reconnect scheduled', { reason, delayMs: delay });
	},
	connectActiveCallsWs() {
		try {
			const accessToken = this._authTokens?.access_token;
			if (!accessToken) return;

			// Avoid reconnecting if already connected/connecting
			if (this._activeCallsWs && (this._activeCallsWs.readyState === WebSocket.OPEN || this._activeCallsWs.readyState === WebSocket.CONNECTING)) {
				return;
			}
			// Reset backoff on explicit connect attempt
			this._activeCallsWsReconnectAttempt = 0;

			// Token exists -> use WS, disable polling fallback
			this.stopPollingActiveCalls();

			const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
			const wsHost = window.location.host; // host:port of current page
			const tokenParam = encodeURIComponent(accessToken);
			const wsUrl = `${wsProto}://${wsHost}/pbxcore/api/module-softphone-backend/v1/sub/active-calls?authorization=${tokenParam}`;

			this._activeCallsWs = new WebSocket(wsUrl);
			this._activeCallsWs.onopen = () => {
				console.log('active-calls ws connected');
				// Reuse the same token refresh timer (it triggers requestBackendEnable)
				this.scheduleContactsWsTokenRefresh();
			};
			this._activeCallsWs.onmessage = (event) => {
				this.handleActiveCallsWsMessage(event?.data);
			};
			this._activeCallsWs.onerror = (event) => {
				console.log('active-calls ws error', event);
			};
			this._activeCallsWs.onclose = (event) => {
				const code = event?.code;
				const reason = event?.reason;
				console.log('active-calls ws closed', { code, reason });

				// Auth closes vary by server implementation.
				const authCloseCodes = new Set([1008, 4001, 4401, 4403]);
				const forceReAuth = authCloseCodes.has(code) || this.isAccessTokenExpired(0);
				this.scheduleActiveCallsWsReconnect('close', forceReAuth);
			};
		} catch (e) {
			console.log('active-calls ws init error', e);
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
				const client = String(item?.client || '').trim();
				if (phone10 && client) {
					this._contactsCacheByPhone10 = this._contactsCacheByPhone10 || {};
					this._contactsCacheByPhone10[phone10] = client;
					this.idbPutContact(phone10, client).catch((e) => console.log('contacts cache save error', e));
				}
				if (window[className].$widgetQueues) {
					window[className].$widgetQueues.updateContactFromWs(item);
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
			const payload = parsed?.queues ? parsed : (parsed?.data?.queues ? parsed.data : null);
			if (!payload) return;
			if (!window[className].$widgetQueues || !window[className].$callsWidget) return;

			window[className].$widgetQueues.updatedCallsFromResponse(payload);
			window[className].$callsWidget.updatedCallsFromResponse(payload);
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
	secondToTime(diffSeconds){
		if (diffSeconds < 0) return '0';
		// Форматируем: чч:мм:сс или мм:сс, или просто секунды
		const hours   = Math.floor(diffSeconds / 3600);
		const minutes = Math.floor((diffSeconds % 3600) / 60);
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
		if(window[className].isInit){
			return;
		}
		let data = {
			[settingName]: value
		};
		$.api({
			url: window[className].saveUserActionUrl,
			on: 'now',
			method: 'POST',
			data: data,
			successTest(response) {
				return response !== undefined && Object.keys(response).length > 0 && response.success === true;
			},
			onSuccess(response) {
				if(settingName === 'queueId'){
					$('#queueId').val($(window[className].queueNameSelector).dropdown('get value'));
					// Re-render queue widget from last received payload (WS mode)
					if (window[className].$widgetQueues && typeof window[className].$widgetQueues.refreshFromLastPayload === 'function') {
						window[className].$widgetQueues.refreshFromLastPayload();
					}
				}else if( settingName === 'adminUserId'){
					window.location.href = window.location.href;
				}
			},
			onFailure(response) {
				console.log(response);
			},
			onError(errorMessage, element, xhr) {
				console.log(errorMessage,xhr);
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
				console.log(errorMessage,xhr);
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
				console.log(errorMessage,xhr);
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
	cbAfterSendForm() {

	},
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
	},
};

$(document).ready(() => {
	window[className].initialize();
});

