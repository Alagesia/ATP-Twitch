'use strict';

const ХРАНИТЬ_СОСТОЯНИЕ_КАНАЛА = 2e4;

let г_оРазобранныйАдрес = null;

let г_сСпособЗаданияАдреса = '';

let г_чПоследняяПроверка = 0;

let г_оЗапрос = null;

let г_сКодКанала = '';

let г_лИдетТрансляция = false;

const м_Отладка = {
	ЗавершитьРаботуИПоказатьСообщение: завершитьРаботу,
	ПойманоИсключение: завершитьРаботу
};

function завершитьРаботу(пИсключениеИлиКодСообщения) {
	if (!г_лРаботаЗавершена) {
		console.error(пИсключениеИлиКодСообщения);
		try {
			г_лРаботаЗавершена = true;
			м_Журнал.Окак('[content.js] Работа завершена');
		} catch (_) {}
	}
	throw void 0;
}

function задатьАдресСтраницы(сАдрес, лЗаменить = false) {
	chrome.runtime.sendMessage({
		сЗапрос: 'ЗапуститьПроигрыватель',
		сАдрес,
		лЗаменить
	});
}

function вставитьНаСтраницу(фВставить) {
	const узСкрипт = document.createElement('script');
	узСкрипт.textContent = `\n\t\t'use strict';\n\t\t(${фВставить})();\n\t`;
	(document.head || document.documentElement).appendChild(узСкрипт);
	узСкрипт.remove();
}

function этотАдресМожноПеренаправлять(оАдрес) {
	return !оАдрес.search.includes(АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ);
}

function получитьНеперенаправляемыйАдрес(оАдрес) {
	return `${оАдрес.protocol}//${оАдрес.host}${оАдрес.pathname}${оАдрес.search.length > 1 ? `${оАдрес.search}&${АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ}` : `?${АДРЕС_НЕ_ПЕРЕНАПРАВЛЯТЬ}`}${оАдрес.hash}`;
}

function запретитьАвтоперенаправлениеЭтойСтраницы() {
	if (этотАдресМожноПеренаправлять(location)) {
		history.replaceState(history.state, '', получитьНеперенаправляемыйАдрес(location));
	}
}

разобратьАдрес.ЭТО_НЕ_КОД_КАНАЛА = new Set([ 'directory', 'embed', 'friends', 'inventory', 'login', 'logout', 'manager', 'messages', 'payments', 'popout', 'search', 'settings', 'signup', 'subscriptions', 'team' ]);

function разобратьАдрес(оАдрес) {
	let лМобильнаяВерсия = false;
	let сСтраница = 'НЕИЗВЕСТНАЯ';
	let сКодКанала = '';
	let лМожноПеренаправлять = false;
	if (оАдрес.protocol === 'https:' && (оАдрес.host === 'www.twitch.tv' || оАдрес.host === 'm.twitch.tv')) {
		лМобильнаяВерсия = оАдрес.host === 'm.twitch.tv';
		const мсЧасти = оАдрес.pathname.split('/');
		if (мсЧасти.length <= 3 && мсЧасти[1] && !мсЧасти[2]) {
			if (!разобратьАдрес.ЭТО_НЕ_КОД_КАНАЛА.has(мсЧасти[1])) {
				сСтраница = 'ВОЗМОЖНО_ПРЯМАЯ_ТРАНСЛЯЦИЯ';
				сКодКанала = decodeURIComponent(мсЧасти[1]);
				лМожноПеренаправлять = этотАдресМожноПеренаправлять(оАдрес);
			}
		} else if ((мсЧасти[1] === 'embed' || мсЧасти[1] === 'popout') && мсЧасти[2] && мсЧасти[3] === 'chat') {
			сСтраница = 'ЧАТ_КАНАЛА';
			сКодКанала = decodeURIComponent(мсЧасти[2]);
		}
	}
	м_Журнал.Окак(`[content.js] Адрес разобран: Страница=${сСтраница} КодКанала=${сКодКанала} МожноПеренаправлять=${лМожноПеренаправлять}`);
	return {
		лМобильнаяВерсия,
		сСтраница,
		сКодКанала,
		лМожноПеренаправлять
	};
}

function запроситьСостояниеКанала(оРазобранныйАдрес) {
	if (!оРазобранныйАдрес.лМожноПеренаправлять || !м_Настройки.Получить('лАвтоперенаправлениеРазрешено')) {
		return;
	}
	if (!г_оЗапрос && г_сКодКанала === оРазобранныйАдрес.сКодКанала && performance.now() - г_чПоследняяПроверка < ХРАНИТЬ_СОСТОЯНИЕ_КАНАЛА) {
		return;
	}
	if (г_оЗапрос && г_сКодКанала === оРазобранныйАдрес.сКодКанала) {
		return;
	}
	отменитьЗапрос();
	г_сКодКанала = оРазобранныйАдрес.сКодКанала;
	г_чПоследняяПроверка = -1;
	отправитьЗапрос();
}

function измененАдресСтраницы(сСпособ) {
	г_оРазобранныйАдрес = разобратьАдрес(location);
	г_сСпособЗаданияАдреса = сСпособ;
	if (!г_оРазобранныйАдрес.лМожноПеренаправлять || !м_Настройки.Получить('лАвтоперенаправлениеРазрешено')) {
		if (г_чПоследняяПроверка === -2) {
			г_чПоследняяПроверка = -1;
		}
		return;
	}
	if (!г_оЗапрос && г_сКодКанала === г_оРазобранныйАдрес.сКодКанала && performance.now() - г_чПоследняяПроверка < ХРАНИТЬ_СОСТОЯНИЕ_КАНАЛА) {
		if (г_лИдетТрансляция) {
			перенаправитьНаНашПроигрыватель(г_сКодКанала);
		}
		return;
	}
	if (г_оЗапрос && г_сКодКанала === г_оРазобранныйАдрес.сКодКанала) {
		г_чПоследняяПроверка = -2;
		return;
	}
	отменитьЗапрос();
	г_сКодКанала = г_оРазобранныйАдрес.сКодКанала;
	г_чПоследняяПроверка = -2;
	отправитьЗапрос();
}

function отменитьЗапрос() {
	if (г_оЗапрос) {
		м_Журнал.Окак('[content.js] Отменяю незавершенный запрос');
		г_оЗапрос.abort();
	}
}

function отправитьЗапрос() {
	м_Журнал.Окак(`[content.js] Посылаю запрос для канала ${г_сКодКанала}`);
	г_оЗапрос = new XMLHttpRequest();
	г_оЗапрос.addEventListener('loadend', обработатьОтвет);
	г_оЗапрос.open('POST', 'https://gql.twitch.tv/gql#origin=twilight');
	г_оЗапрос.responseType = 'json';
	г_оЗапрос.timeout = 15e3;
	г_оЗапрос.setRequestHeader('Accept-Language', 'en-US');
	г_оЗапрос.setRequestHeader('Client-ID', 'kimne78kx3ncx6brgo4mv6wki5h1ko');
	г_оЗапрос.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
	if (отправитьЗапрос._мсИдУстройства === void 0) {
		отправитьЗапрос._мсИдУстройства = document.cookie.match(/(?:^|;[ \t]?)unique_id=([^;]+)/);
	}
	if (отправитьЗапрос._мсИдУстройства) {
		г_оЗапрос.setRequestHeader('X-Device-ID', отправитьЗапрос._мсИдУстройства[1]);
	}
	г_оЗапрос.send(создатьТелоЗапросаGql(`query($login: String!) {
			user(login: $login) {
				stream {
					isEncrypted
				}
				watchParty {
					session {
						state
					}
				}
			}
		}`, {
		login: г_сКодКанала
	}));
}

function обработатьОтвет({target: оЗапрос}) {
	г_оЗапрос = null;
	if (оЗапрос.status >= 200 && оЗапрос.status < 300 && ЭтоОбъект(оЗапрос.response)) {
		const лПеренаправить = г_чПоследняяПроверка === -2;
		г_чПоследняяПроверка = performance.now();
		let лТрансляцияЗавершенаИлиЗакодирована = true, лСовместныйПросмотр = false;
		try {
			лТрансляцияЗавершенаИлиЗакодирована = оЗапрос.response.data.user.stream.isEncrypted === true;
			лСовместныйПросмотр = оЗапрос.response.data.user.watchParty.session.state === 'IN_PROGRESS';
		} catch (_) {}
		г_лИдетТрансляция = !лТрансляцияЗавершенаИлиЗакодирована && !лСовместныйПросмотр;
		if (г_лИдетТрансляция && лПеренаправить) {
			перенаправитьНаНашПроигрыватель(г_сКодКанала);
		}
	} else {
		г_чПоследняяПроверка = 0;
	}
}

function запуститьНашПроигрыватель(сКодКанала) {
	const сАдресПроигрывателя = ПолучитьАдресНашегоПроигрывателя(сКодКанала);
	м_Журнал.Окак(`[content.js] Перехожу на страницу ${сАдресПроигрывателя}`);
	запретитьАвтоперенаправлениеЭтойСтраницы();
	задатьАдресСтраницы(сАдресПроигрывателя);
}

function перенаправитьНаНашПроигрыватель(сКодКанала) {
	const сАдресПроигрывателя = ПолучитьАдресНашегоПроигрывателя(сКодКанала);
	м_Журнал.Окак(`[content.js] Меняю адрес страницы с ${location.href} на ${сАдресПроигрывателя}`);
	document.documentElement.setAttribute('data-tw5-перенаправление', сАдресПроигрывателя);
	if (получитьВерсиюБраузера() >= 57 && !этоМобильноеУстройство()) {
		задатьАдресСтраницы(сАдресПроигрывателя, true);
	} else if (г_сСпособЗаданияАдреса === 'PUSHSTATE') {
		history.back();
	} else {
		запретитьАвтоперенаправлениеЭтойСтраницы();
		задатьАдресСтраницы(сАдресПроигрывателя);
	}
}

function обработатьPointerDownИClick(оСобытие) {
	if (г_оРазобранныйАдрес) {
		const узСсылка = оСобытие.target.closest('a[href]');
		if (узСсылка && оСобытие.isPrimary !== false && оСобытие.button === ЛЕВАЯ_КНОПКА && !оСобытие.shiftKey && !оСобытие.ctrlKey && !оСобытие.altKey && !оСобытие.metaKey) {
			м_Журнал.Окак(`[content.js] Произошло событие ${оСобытие.type} у ссылки ${узСсылка.href}`);
			запроситьСостояниеКанала(разобратьАдрес(узСсылка));
		}
	}
}

function обработатьPopState(оСобытие) {
	if (г_оРазобранныйАдрес) {
		м_Журнал.Окак(`[content.js] Произошло событие popstate ${location.href}`);
		document.title = 'Twitch';
		if (document.documentElement.hasAttribute('data-tw5-перенаправление')) {
			м_Журнал.Окак('[content.js] Завершаю перенаправление');
			оСобытие.stopImmediatePropagation();
			задатьАдресСтраницы(document.documentElement.getAttribute('data-tw5-перенаправление'));
			return;
		}
		измененАдресСтраницы('POPSTATE');
		if (document.documentElement.hasAttribute('data-tw5-перенаправление')) {
			м_Журнал.Окак('[content.js] Скрываю событие popstate');
			оСобытие.stopImmediatePropagation();
		}
	}
}

function обработатьPushState(оСобытие) {
	м_Журнал.Окак(`[content.js] Произошло событие tw5-pushstate ${location.href}`);
	измененАдресСтраницы('PUSHSTATE');
}

function обработатьЗапускНашегоПроигрывателя(оСобытие) {
	оСобытие.preventDefault();
	if (оСобытие.button === ЛЕВАЯ_КНОПКА && г_оРазобранныйАдрес.сСтраница === 'ВОЗМОЖНО_ПРЯМАЯ_ТРАНСЛЯЦИЯ') {
		запуститьНашПроигрыватель(г_оРазобранныйАдрес.сКодКанала);
	} else {
		м_Журнал.Окак(`[content.js] Не запускать проигрыватель Кнопка=${оСобытие.button} Страница=${г_оРазобранныйАдрес.сСтраница}`);
	}
}

function обработатьПереключениеАвтоперенаправления(оСобытие) {
	оСобытие.preventDefault();
	м_Настройки.Изменить('лАвтоперенаправлениеРазрешено', !м_Настройки.Получить('лАвтоперенаправлениеРазрешено'));
	обновитьНашуКнопку();
}

function обработатьЗакрытиеСправки(оСобытие) {
	оСобытие.preventDefault();
	if (оСобытие.type !== 'mouseover' || performance.now() > 3e3) {
		м_Журнал.Окак('[content.js] Закрываю справку');
		оСобытие.currentTarget.classList.remove('tw5-справка');
		оСобытие.currentTarget.removeEventListener('mouseover', обработатьЗакрытиеСправки);
		оСобытие.currentTarget.removeEventListener('touchstart', обработатьЗакрытиеСправки);
		м_Настройки.Изменить('лАвтоперенаправлениеЗамечено', true);
	}
}

function получитьНашуКнопку() {
	return document.getElementById('tw5-автоперенаправление');
}

function обновитьНашуКнопку() {
	const кнопка = получитьНашуКнопку();
	кнопка.classList.toggle('tw5-запрещено', !м_Настройки.Получить('лАвтоперенаправлениеРазрешено'));
	return кнопка;
}

function вставитьНашуКнопку() {
	const кудаВставить = document.querySelector('.top-nav__menu > div:last-child > div:first-child');
	if (!кудаВставить) {
		return false;
	}
	м_Журнал.Окак('[content.js] Вставляю нашу кнопку');
	кудаВставить.insertAdjacentHTML('afterend', `
	<div class="tw5-автоперенаправление tw5-js-удалить">
		<button type="button" id="tw5-автоперенаправление">
			<svg viewBox="0 0 128 128">
				<g>
					<path d="M64 53h-19.688l-1.313-15.225h57l1.313-14.7h-74.55l3.937 44.888h51.712l-1.8 19.162-16.6 4.463l-16.8-4.463-1.1-11.813h-14.7l1.838 23.362 30.713 8.4l30.45-8.4 4.2-45.675z"/>
				</g>
			</svg>
		</button>
		<div class="tw5-подсказка"></div>
		<style>
			.tw5-автоперенаправление
			{
				flex: 0 0;
				margin: 0 .5rem;
				position: relative;
			}
			#tw5-автоперенаправление
			{
				align-items: center;
				background-color: var(--color-background-button-text-default);
				border-radius: var(--border-radius-rounded);
				display: flex;
				fill: var(--color-fill-button-icon);
				height: var(--button-size-default);
				justify-content: center;
				width: var(--button-size-default);
			}
			#tw5-автоперенаправление:hover
			{
				background-color: var(--color-background-button-text-hover);
				fill: var(--color-fill-button-icon-hover);
			}
			#tw5-автоперенаправление:active
			{
				background-color: var(--color-background-button-text-active);
				fill: var(--color-fill-button-icon-active);
			}
			#tw5-автоперенаправление > svg
			{
				width: 75%;
			}
			.tw5-запрещено > svg
			{
				opacity: .4;
			}
			.tw5-подсказка
			{
				background-color: var(--color-background-tooltip);
				border-radius: var(--border-radius-medium);
				color: var(--color-text-tooltip);
				display: none;
				font-size: var(--font-size-4);
				font-weight: var(--font-weight-semibold);
				left: 50%;
				line-height: 1.22;
				margin-top: 10px;
				max-width: 25.4rem;
				padding: 6px;
				pointer-events: none;
				position: absolute;
				top: 100%;
				transform: translateX(-50%);
				width: -moz-max-content;
				width: max-content;
				z-index: var(--z-index-modal);
			}
			.tw5-подсказка::after
			{
				background-color: inherit;
				border-radius: var(--border-radius-small) 0 0 0;
				content: "";
				height: 6px;
				left: 50%;
				position: absolute;
				top: -3px;
				transform: translateX(-50%) rotate(45deg);
				width: 6px;
				z-index: var(--z-index-below);
			}
			.tw5-автоперенаправление:hover .tw5-подсказка
			{
				display: block;
			}
			.tw5-справка .tw5-подсказка
			{
				background: #f00000;
				color: #fff;
				display: block;
				pointer-events: auto;
			}
		</style>
	</div>
	`);
	const кнопка = обновитьНашуКнопку();
	кнопка.nextElementSibling.textContent = м_i18n.GetMessage('J0600');
	кнопка.addEventListener('click', обработатьЗапускНашегоПроигрывателя);
	кнопка.addEventListener('contextmenu', обработатьПереключениеАвтоперенаправления);
	if (!м_Настройки.Получить('лАвтоперенаправлениеЗамечено')) {
		кнопка.parentNode.classList.add('tw5-справка');
		кнопка.parentNode.addEventListener('mouseover', обработатьЗакрытиеСправки);
		кнопка.parentNode.addEventListener('touchstart', обработатьЗакрытиеСправки, {
			passive: false
		});
	}
	return true;
}

function вставитьНашуКнопкуВПервыйРаз() {
	if (!г_оРазобранныйАдрес.лМобильнаяВерсия) {
		вставитьНашуКнопку();
		window.addEventListener('tw5-изменензаголовок', () => {
			if (!получитьНашуКнопку()) {
				вставитьНашуКнопку();
			}
		});
	}
}

function перехватитьФункции() {
	let _лНеПерехватывать = false;
	window.addEventListener('tw5-неперехватывать', () => {
		_лНеПерехватывать = true;
	});
	const oTitleDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
	Object.defineProperty(document, 'title', {
		configurable: oTitleDescriptor.configurable,
		enumerable: oTitleDescriptor.enumerable,
		get() {
			return oTitleDescriptor.get.call(this);
		},
		set(title) {
			if (_лНеПерехватывать) {
				oTitleDescriptor.set.call(this, title);
			} else if (this.documentElement.hasAttribute('data-tw5-перенаправление')) {} else {
				oTitleDescriptor.set.call(this, title);
				window.dispatchEvent(new CustomEvent('tw5-изменензаголовок'));
			}
		}
	});
	const fPushState = history.pushState;
	history.pushState = function(state, title) {
		if (_лНеПерехватывать) {
			fPushState.apply(this, arguments);
		} else if (document.documentElement.hasAttribute('data-tw5-перенаправление')) {} else {
			const сБыло = location.pathname;
			fPushState.apply(this, arguments);
			if (сБыло !== location.pathname) {
				oTitleDescriptor.set.call(document, 'Twitch');
				window.dispatchEvent(new CustomEvent('tw5-pushstate'));
			}
		}
	};
}

function разрешитьРаботуЧата() {
	const fGetItem = Storage.prototype.getItem;
	Storage.prototype.getItem = function(сИмя) {
		let сЗначение = fGetItem.apply(this, arguments);
		if (сИмя === 'TwitchCache:Layout' && сЗначение) {
			сЗначение = сЗначение.replace('"isRightColumnClosedByUserAction":true', '"isRightColumnClosedByUserAction":false');
		}
		return сЗначение;
	};
}

function изменитьСтильЧата() {
	const узСтиль = document.createElement('link');
	узСтиль.rel = 'stylesheet';
	узСтиль.href = chrome.runtime.getURL('content.css');
	узСтиль.className = 'tw5-js-удалить';
	(document.head || document.documentElement).appendChild(узСтиль);
}

function изменитьПоведениеЧата() {
	window.addEventListener('click', оСобытие => {
		if (!document.hasFocus()) {
			const {activeElement} = document;
			if (activeElement) {
				if (activeElement.nodeName === 'BODY') {
					activeElement.setAttribute('tabindex', '-1');
					activeElement.focus();
					activeElement.removeAttribute('tabindex');
				} else {
					activeElement.focus();
				}
			}
		}
		if (оСобытие.button !== ЛЕВАЯ_КНОПКА) {
			return;
		}
		const узСсылка = оСобытие.target.closest('a[href^="http:"],a[href^="https:"],a[href]:not([href=""]):not([href^="#"]):not([href*=":"]):not([href$="/not-a-location"])');
		if (!узСсылка) {
			return;
		}
		м_Журнал.Окак(`[content.js] Открываю ссылку в новой вкладке: ${узСсылка.getAttribute('href')}`);
		узСсылка.target = '_blank';
		оСобытие.stopImmediatePropagation();
	}, true);
}

function удалитьХвостыСтаройВерсии() {
	const сузУдалить = document.getElementsByClassName('tw5-js-удалить');
	while (сузУдалить.length !== 0) {
		м_Журнал.Окак(`[content.js] Удаляю ${сузУдалить[0].nodeName} старой версии`);
		сузУдалить[0].remove();
	}
	window.dispatchEvent(new CustomEvent('tw5-неперехватывать'));
}

ДобавитьОбработчикИсключений(() => {
	м_Журнал.Окак(`[content.js] Запущен ${performance.now().toFixed()}мс ${location.href}`);
	if (разобратьАдрес(location).сСтраница === 'ЧАТ_КАНАЛА') {
		вставитьНаСтраницу(разрешитьРаботуЧата);
		if (window.top !== window) {
			изменитьСтильЧата();
			изменитьПоведениеЧата();
		}
		return;
	}
	удалитьХвостыСтаройВерсии();
	const сСобытие = window.PointerEvent ? 'pointerdown' : 'mousedown';
	window.addEventListener(сСобытие, обработатьPointerDownИClick, true);
	window.addEventListener('click', обработатьPointerDownИClick, true);
	window.addEventListener('popstate', обработатьPopState);
	м_Настройки.Восстановить().then(() => {
		измененАдресСтраницы('LOAD');
		window.addEventListener('tw5-pushstate', обработатьPushState);
		вставитьНаСтраницу(перехватитьФункции);
		вставитьНашуКнопкуВПервыйРаз();
	}).catch(м_Отладка.ПойманоИсключение);
})();