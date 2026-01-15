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
	queueNameSelector: '#app-queue div.scrolling.dropdown',
	$formObj: $('#'+idForm),
	$checkBoxes: $('#'+idForm+' .ui.checkbox'),
	$dropDowns: $('#'+idForm+' .ui.dropdown'),
	activeChannelsUrl: globalRootUrl + idUrl + "/getActiveChannels",
	activeChannelsUrlV2: globalRootUrl + idUrl + "/getActiveChannelsV2",
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
					let queueNameEl = $(window[className].queueNameSelector);
					this.minWaitVisible = 1*$('#minWaitVisibleValue').val();

					this.queues = data.queues;
					let queueId = $('#queueId').val();
					if (queueId in data.queues) {
						this.id     = data.queues[queueId].id;
						this.name   = data.queues[queueId].name;
						this.number = data.queues[queueId].number;
						this.agents = data.queues[queueId].agents;
						this.agentsList = this.buildAgentsList(this.agents);
						this.calls  = Array.isArray(data.queues[queueId].calls) ? data.queues[queueId].calls : [];
						this.allCalls = data.calls;
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
				formatElapsedTime(enterTime) {
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
					// Placeholder for future "peer name" feature
					void agentNumber;
					return '—';
				}
			},
			data: {
				"minWaitVisible": 30,
				"name": "",
				"number": "",
				"queues": [],
				"agents": {
				},
				"agentsList": [],
				"calls": [
				]
			},
		});

		window[className].$callsWidget = new Vue({
			el: '#calls',
			delimiters: ["<%","%>"],
			data: {
				"minWaitVisible": 30,
				userNumber: userNumber,
				fullAccess: ($('#fullAccess').val() === "1" || userNumber === ''),
				calls: [
				]
			},
			methods: {
				callIsVisible(call){
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
					let answer = Math.floor(Date.now() / 1000);
					if(call.answer !== ''){
						answer = call.answer
					}
					return window[className].secondToTime(answer - call.start);
				},
				getCallTime(call){
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
		//////
		// Удаляем отступы контейнера.
		$('#main-content-container').removeClass('container');
		$('#module-status-toggle-segment').hide();
		$('.ui.clearing.hidden.divider').remove();
		// Окончание форматирования базовой страницы
		//////
		window[className].updateLines();
		setInterval(window[className].updateLines, 2000);
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

