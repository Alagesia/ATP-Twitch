(() => {
	'use strict';
	const _оСвойства = {
		pointerId: 0,
		width: 1,
		height: 1,
		pressure: 0,
		tangentialPressure: 0,
		tiltX: 0,
		tiltY: 0,
		twist: 0,
		pointerType: '',
		isPrimary: false
	};
	class PointerEvent extends MouseEvent {
		constructor(сТипСобытия, оПараметры = {}) {
			super(сТипСобытия, оПараметры);
			const оОпределениеСвойства = {
				enumerable: true,
				configurable: true
			};
			for (const сИмя of Object.keys(_оСвойства)) {
				if (сИмя in оПараметры) {
					if (typeof оПараметры[сИмя] != typeof _оСвойства[сИмя] || Number.isNaN(оПараметры[сИмя])) {
						throw new TypeError(`В конструктор PointerEvent передан параметр ${сИмя} недопустимого типа`);
					}
					оОпределениеСвойства.value = оПараметры[сИмя];
				} else {
					оОпределениеСвойства.value = _оСвойства[сИмя];
				}
				Object.defineProperty(this, сИмя, оОпределениеСвойства);
			}
		}
	}
	function добавитьОбработчикСобытияВвода(фВызвать) {
		return ДобавитьОбработчикИсключений(оСобытие => {
			try {
				оСобытие.bubbles;
			} catch (_) {
				return;
			}
			фВызвать(оСобытие);
		});
	}
	let _лЗадерживатьСообщенияМыши = false;
	function СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, сТипСобытия, button) {
		const оПараметры = {};
		оПараметры.bubbles = оСобытиеМыши.bubbles;
		оПараметры.cancelable = оСобытиеМыши.cancelable;
		оПараметры.composed = true;
		оПараметры.view = оСобытиеМыши.view;
		оПараметры.ctrlKey = оСобытиеМыши.ctrlKey;
		оПараметры.shiftKey = оСобытиеМыши.shiftKey;
		оПараметры.altKey = оСобытиеМыши.altKey;
		оПараметры.metaKey = оСобытиеМыши.metaKey;
		оПараметры.modifierAltGraph = оСобытиеМыши.getModifierState('AltGraph');
		оПараметры.modifierCapsLock = оСобытиеМыши.getModifierState('CapsLock');
		оПараметры.modifierNumLock = оСобытиеМыши.getModifierState('NumLock');
		оПараметры.modifierScrollLock = оСобытиеМыши.getModifierState('ScrollLock');
		оПараметры.screenX = оСобытиеМыши.screenX;
		оПараметры.screenY = оСобытиеМыши.screenY;
		оПараметры.clientX = оСобытиеМыши.clientX;
		оПараметры.clientY = оСобытиеМыши.clientY;
		оПараметры.button = button;
		оПараметры.buttons = оСобытиеМыши.buttons;
		оПараметры.relatedTarget = оСобытиеМыши.relatedTarget;
		оПараметры.pressure = оПараметры.buttons === 0 ? 0 : .5;
		оПараметры.pointerType = 'mouse';
		оПараметры.isPrimary = true;
		const оСобытиеУказателя = new PointerEvent(сТипСобытия, оПараметры);
		Object.defineProperty(оСобытиеУказателя, 'timeStamp', {
			enumerable: true,
			configurable: true,
			value: оСобытиеМыши.timeStamp
		});
		const лОтменено = !оСобытиеМыши.target.dispatchEvent(оСобытиеУказателя);
		if (лОтменено) {
			оСобытиеМыши.preventDefault();
		}
		return лОтменено;
	}
	const ОбработатьMouseDown = добавитьОбработчикСобытияВвода(оСобытиеМыши => {
		if ((оСобытиеМыши.buttons & оСобытиеМыши.buttons - 1) == 0) {
			_лЗадерживатьСообщенияМыши = СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointerdown', оСобытиеМыши.button);
		} else {
			СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointermove', оСобытиеМыши.button);
		}
		if (_лЗадерживатьСообщенияМыши) {
			оСобытиеМыши.stopImmediatePropagation();
		}
	});
	const ОбработатьMouseMove = добавитьОбработчикСобытияВвода(оСобытиеМыши => {
		СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointermove', -1);
		if (_лЗадерживатьСообщенияМыши) {
			оСобытиеМыши.stopImmediatePropagation();
		}
	});
	const ОбработатьMouseUp = добавитьОбработчикСобытияВвода(оСобытиеМыши => {
		if (оСобытиеМыши.buttons === 0) {
			СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointerup', оСобытиеМыши.button);
		} else {
			СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointermove', оСобытиеМыши.button);
		}
		if (_лЗадерживатьСообщенияМыши) {
			оСобытиеМыши.stopImmediatePropagation();
		}
		if (оСобытиеМыши.buttons === 0) {
			_лЗадерживатьСообщенияМыши = false;
		}
	});
	const ОбработатьMouseOver = добавитьОбработчикСобытияВвода(оСобытиеМыши => {
		СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointerover', -1);
	});
	const ОбработатьMouseOut = добавитьОбработчикСобытияВвода(оСобытиеМыши => {
		СоздатьИПослатьСобытиеУказателяДляМыши(оСобытиеМыши, 'pointerout', -1);
	});
	let _чИдОсновногоУказателя = NaN;
	function СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, сТипСобытия, bubbles, cancelable, button, buttons, target = оКасание.target) {
		const оПараметры = {};
		оПараметры.bubbles = bubbles;
		оПараметры.cancelable = cancelable;
		оПараметры.composed = true;
		оПараметры.view = оСобытиеКасания.view;
		оПараметры.ctrlKey = оСобытиеКасания.ctrlKey;
		оПараметры.shiftKey = оСобытиеКасания.shiftKey;
		оПараметры.altKey = оСобытиеКасания.altKey;
		оПараметры.metaKey = оСобытиеКасания.metaKey;
		оПараметры.screenX = оКасание.screenX;
		оПараметры.screenY = оКасание.screenY;
		оПараметры.clientX = оКасание.clientX;
		оПараметры.clientY = оКасание.clientY;
		оПараметры.button = button;
		оПараметры.buttons = buttons;
		оПараметры.pointerId = оКасание.identifier;
		оПараметры.width = оКасание.radiusX * 2;
		оПараметры.height = оКасание.radiusY * 2;
		оПараметры.pressure = оКасание.force;
		оПараметры.pointerType = 'touch';
		оПараметры.isPrimary = оКасание.identifier === _чИдОсновногоУказателя;
		const оСобытиеУказателя = new PointerEvent(сТипСобытия, оПараметры);
		Object.defineProperty(оСобытиеУказателя, 'timeStamp', {
			enumerable: true,
			configurable: true,
			value: оСобытиеКасания.timeStamp
		});
		target.dispatchEvent(оСобытиеУказателя);
	}
	function дляКаждогоИзмененногоКасания(оСобытиеКасания, фВызвать) {
		for (let ы = 0; ы < оСобытиеКасания.changedTouches.length; ++ы) {
			const оКасание = оСобытиеКасания.changedTouches.item(ы);
			if (оКасание.target === оСобытиеКасания.target) {
				фВызвать(оКасание);
			}
		}
	}
	const ОбработатьTouchStart = добавитьОбработчикСобытияВвода(оСобытиеКасания => {
		if (оСобытиеКасания.target.closest('[data-тащилка]')) {
			оСобытиеКасания.preventDefault();
		}
		if (оСобытиеКасания.changedTouches.length === оСобытиеКасания.touches.length) {
			_чИдОсновногоУказателя = оСобытиеКасания.changedTouches.item(0).identifier;
		}
		дляКаждогоИзмененногоКасания(оСобытиеКасания, оКасание => {
			СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointerover', true, true, 0, 1);
			const моПолучатели = [ оКасание.target ];
			for (let оПолучатель = оКасание.target; оПолучатель = оПолучатель.parentElement; ) {
				моПолучатели.push(оПолучатель);
			}
			for (let ы = моПолучатели.length; --ы >= 0; ) {
				СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointerenter', false, false, 0, 1, моПолучатели[ы]);
			}
			СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointerdown', true, true, 0, 1);
		});
	});
	const ОбработатьTouchMove = добавитьОбработчикСобытияВвода(оСобытиеКасания => {
		дляКаждогоИзмененногоКасания(оСобытиеКасания, оКасание => {
			СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointermove', true, true, -1, 1);
		});
	});
	const ОбработатьTouchEnd = добавитьОбработчикСобытияВвода(оСобытиеКасания => {
		if (оСобытиеКасания.target.closest('[data-тащилка]')) {
			оСобытиеКасания.preventDefault();
		}
		ОбработатьTouchEndИлиCancel(оСобытиеКасания, false);
	});
	const ОбработатьTouchCancel = добавитьОбработчикСобытияВвода(оСобытиеКасания => {
		ОбработатьTouchEndИлиCancel(оСобытиеКасания, true);
	});
	function ОбработатьTouchEndИлиCancel(оСобытиеКасания, лОтмена) {
		дляКаждогоИзмененногоКасания(оСобытиеКасания, оКасание => {
			if (лОтмена) {
				СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointercancel', true, false, 0, 0);
			} else {
				СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointerup', true, true, 0, 0);
			}
			СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointerout', true, true, 0, 0);
			for (let оПолучатель = оКасание.target; оПолучатель; оПолучатель = оПолучатель.parentElement) {
				СоздатьИПослатьСобытиеУказателяДляКасания(оСобытиеКасания, оКасание, 'pointerleave', false, false, 0, 0, оПолучатель);
			}
			if (оКасание.identifier === _чИдОсновногоУказателя) {
				_чИдОсновногоУказателя = NaN;
			}
		});
	}
	Object.defineProperty(window, 'PointerEvent', {
		writable: true,
		configurable: true,
		value: PointerEvent
	});
	if (window.TouchEvent) {
		м_Журнал.Ой('[PointerEvent] Использую события касания');
		const оАктивный = {
			capture: true,
			passive: false
		};
		const оПассивный = {
			capture: true,
			passive: true
		};
		window.addEventListener('touchstart', ОбработатьTouchStart, оАктивный);
		window.addEventListener('touchend', ОбработатьTouchEnd, оАктивный);
		window.addEventListener('touchmove', ОбработатьTouchMove, оПассивный);
		window.addEventListener('touchcancel', ОбработатьTouchCancel, оПассивный);
	} else {
		м_Журнал.Ой('[PointerEvent] Использую события мыши');
		window.addEventListener('mousedown', ОбработатьMouseDown, true);
		window.addEventListener('mousemove', ОбработатьMouseMove, true);
		window.addEventListener('mouseup', ОбработатьMouseUp, true);
		window.addEventListener('mouseover', ОбработатьMouseOver, true);
		window.addEventListener('mouseout', ОбработатьMouseOut, true);
	}
})();