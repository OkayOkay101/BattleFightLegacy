var ItemUiComponent = IgeEntity.extend({
	classId: 'ItemUiComponent',
	componentId: 'itemUi',

	init: function () {
		var self = this;
		var i18n = ige.client && ige.client.i18n;
		if (i18n) i18n.subscribe(function () {
			ige.$$('item').forEach(function (item) { self.updateItemDescription(item); });
		});
		$('#backpack-items-div').on('mouseenter', '.inventory-item-button.inventory-slot>.item-div.draggable-item', function () {
			$('.popover').popover('hide');
			$(this).popover('show');
		});
		$('#trade-div').on('mouseenter', '.inventory-item-button.inventory-slot>.item-div.draggable-item', function () {
			$('.popover').popover('hide');
			$(this).popover('show');
		});
		$('#trade-div').on('mouseenter', '.trade-offer-slot>.item-div.draggable-item', function () {
			$('.popover').popover('hide');
			$(this).popover('show');
		});
		$('#inventory-slots').on('mouseenter', '.inventory-item-button.inventory-slot>.item-div.draggable-item', function () {
			$('.popover').popover('hide');
			$(this).popover('show');
		});
		$('canvas').on('mouseenter', function () {
			$('.popover').popover('hide');
		});
		jQuery.fn.swap = function (b) {
			// method from: http://blog.pengoworks.com/index.cfm/2008/9/24/A-quick-and-dirty-swap-method-for-jQuery
			b = jQuery(b)[0];
			var tempId = b.parentElement.id.replace('item-', '');
			var a = this[0];
			b.id = `slotindex-${a.parentElement.id.replace('item-', '').id}`;
			a.id = `slotindex-${tempId}`;
			var t = a.parentNode.insertBefore(document.createTextNode(''), a);
			b.parentNode.insertBefore(a, b);
			t.parentNode.insertBefore(b, t);
			t.parentNode.removeChild(t);
			return this;
		};
	},

	showReloadingText: function () {
		$('#reloading-message').show();
	},

	hideReloadingText: function () {
		$('#reloading-message').hide();
	},

	updateItemInfo: function (item) {
		if (item && item._stats) {
			$('#item-name').html(item._stats.name);

			var ammoStr = '';
			if (item._stats.ammo != undefined)
				ammoStr = `${item._stats.ammo} / ${item._stats.ammoTotal}`;

			// $("#item-ammo").html(ammoStr)
		} else {
			$('#item-name').html('');
			$('#item-ammo').html('');
		}
	},

	updateItemSlot: function (item, slotIndex) {
		var self = this;
		var owner = item && item.getOwnerUnit();
		var equipmentAllowed = (owner && owner._stats.equipmentAllowed);
		// update item info on bottom-right corner if it's currently selected item
		$(`#item-${slotIndex}`).html(
			self.getItemDiv(item, {
				popover: 'top',
				isDraggable: true,
				isPurchasable: false
			}, slotIndex)
		);

		// if (equipmentAllowed && slotIndex != undefined && slotIndex <= equipmentAllowed) {
		$(`#item-key-stroke-${slotIndex}`).html(
			`<p class='m-0'><small style='font-weight:900;color: white;padding: 0px 5px;'>${slotIndex + 1}</small></p>`
		);
		// }
	},
	updateItemQuantity: function (item) {
		var itemSlot = $(`#slotindex-${item._stats.slotIndex}`);
		quantitySpan = itemSlot.find('small');
		if (quantitySpan) {
			var qty = item._stats.quantity;
			if (!isNaN(parseFloat(qty))) {
				quantitySpan.text(parseFloat(qty));
			}
		}

		var owner = item.getOwnerUnit();
		if (owner && parseFloat(item._stats.quantity) <= 0 && item._stats.removeWhenEmpty == true) {
			item.remove();
			var indexOfItem = owner._stats.itemIds.indexOf(item.id());
			if (indexOfItem > -1) {
				owner._stats.itemIds.splice(indexOfItem, 1);
			}
			owner.inventory.update();
		}
	},
	getItemSlotDiv: function (itemStats, options) {
		var mobileClass = ige.isMobile ? 'inventory-slot-mobile ' : 'inventory-slot ';
		if (itemStats) {
			var itemSlot = $('<div/>', {
				id: itemStats.id,
				class: `btn btn-secondary ${mobileClass}`
			}).append(this.getItemDiv(itemStats, options));

			if (options.isPurchasable) {
				itemSlot.on('click', function () {
					// ige.shopkeeper.confirmPurchase($(this).attr("id"))
				});
			}

			return itemSlot;
		}
	},

	getItemDiv: function (item, options, slotIndex) {
		var self = this;
		if (item) {
			var itemStats = item._stats;
			if (itemStats) {
				var itemDetail = $('<div/>', {
					style: 'font-size: 16px; width: 250px;',
					html: this.getItemHtml(itemStats)
				});

				var itemQuantity = item._stats.quantity !== undefined ? item._stats.quantity : '';
				// || item._stats.maxQuantity === null
				if ((item._stats.quantity == 1 && item._stats.maxQuantity == 1) || item._stats.quantity === null) {
					itemQuantity = '';
				}

				var img = itemStats.inventoryImage || (itemStats.cellSheet ? itemStats.cellSheet.url : '');
				var mobileClass = ige.isMobile ? 'height:17px;max-width:20px;object-fit:contain' : 'height:30px;max-width:27px;object-fit:contain';
				var isTrading = options.isTrading;
				if (img) {
					var itemDiv = $('<div/>', {
						id: `slotindex-${slotIndex}`,
						class: 'item-div draggable-item',
						style: 'height:100%',
						role: 'button',
						html: `<div class='${!isTrading ? 'absolute-center' : ''}'><img src='${img}' style='${mobileClass}'/></div><small class='quantity'>${!isNaN(parseFloat(itemQuantity)) && parseFloat(itemQuantity) || itemQuantity}</small>`,
						'data-container': 'body',
						'data-toggle': 'popover',
						'data-placement': options.popover || 'left',
						'data-content': itemDetail.prop('outerHTML')
					})
						.popover({
							html: true,
							animation: false,
							trigger: 'manual'
						});
				}
			}
		} else {
			var itemDiv = $('<div/>', {
				id: `slotindex-${slotIndex}`,
				class: 'item-div draggable-item',
				style: 'height:100%',
				role: 'button'
			});
		}
		if (options.isDraggable && itemDiv) {
			itemDiv.draggable({
				revert: 'invalid',
				cursor: 'move',
				// helper: "clone",
				zIndex: 10000,
				containment: 'window',
				appendTo: 'body',
				start: function (event, ui) { // when being dragged, disable popover. it doesn't need to be enabled later, because updateInventory overwrites popover div
					$('.popover').popover('disable');
				}
			}).droppable({
				drop: function (event, ui) {
					var draggable = ui.draggable; var droppable = $(this);
					var dragPos = draggable.position(); var dropPos = droppable.position();
					var fromIndex = parseFloat(ui.draggable[0].parentElement.id.replace('item-', ''));
					// var isTradingItemDragged = ui.draggable[0].parentElement.name.include('trade');
					var toIndex = parseFloat(droppable[0].parentElement.id.replace('item-', ''));
					// var isItemDroppedOnTradeSlot = droppable[0].parentElement.name.include('trade');
					draggable.css({
						// left: dropPos.left + 'px',
						// top: dropPos.top + 'px'
						left: 0, top: 0
					});

					droppable.css({
						// left: dragPos.left + 'px',
						// top: dragPos.top + 'px'
						left: 0, top: 0
					});

					var selectedUnit = ige.client.myPlayer.getSelectedUnit();
					var items = selectedUnit._stats.itemIds;

					var fromItem = ige.$(items[fromIndex]);
					var toItem = ige.$(items[toIndex]);
					if (fromItem) {
						fromItem.stopUsing();
					}

					if (toItem) {
						toItem.stopUsing();
					}

					ige.network.send('swapInventory', { from: fromIndex, to: toIndex });

					var tempItem = items[fromIndex];
					items[fromIndex] = items[toIndex];
					items[toIndex] = tempItem;

					var totalInventorySlot = selectedUnit._stats.inventorySize;
					if (ige.client.myPlayer.isTrading && (fromIndex >= totalInventorySlot || toIndex >= totalInventorySlot)) {
						ige.tradeUi.sendOfferingItems();
					}
				}
			});
		}
		return itemDiv;

		return $('<div/>', {
			style: 'font-size: 16px; width: 250px;',
			html: ''
		});
	},

	getItemHtml: function (itemStats) {
		var self = this;

		// var buffs = self.getBuffList(itemStats);

		var itemTitle = $('<h4/>', {
			html: itemStats.name
		});

		var itemDiv = $('<div/>', {
			class: 'caption '
		});

		// console.log(itemStats)

		var itemHtml = self.getItemPopOverContent(itemStats);
		// for (attr in itemStats)
		// {
		// 	var itemValue = itemStats[attr];
		// 	itemHtml.append($("<p/>", {
		// 		html: self.getAttrStr(attr, itemValue)
		// 	}))

		// }

		itemDiv
			// .append(
			// 	$("<span/>", {
			// 		class: 'pull-right ' + buffs.css,
			// 		text: buffs.name
			// 	})
			// )
			.append(itemTitle)
			.append($('<hr/>'))
			.append(itemHtml)
			.append($('<hr/>'));
		// .append($("<h6/>", {html: "Buffs"}))
		// .append(buffs.html)

		return itemDiv;
	},
	_t: function (key, values) {
		var i18n = ige.client && ige.client.i18n;
		return i18n ? i18n.t(key, values) : key;
	},
	updateItemDescription: function (item) {
		var inventorySlotIfPresent = item._stats.slotIndex;
		if (item && item._stats && (inventorySlotIfPresent === 0 || inventorySlotIfPresent)) {
			var popoverContent = $('<div/>', {
				style: 'font-size: 16px; width: 250px;',
				html: this.getItemHtml(item._stats)
			});

			$(`#slotindex-${inventorySlotIfPresent}`).attr('data-content', popoverContent[0].outerHTML);
		}
	},
	getItemPopOverContent: function (stats) {
		var info = '<div>';
		var t = this._t.bind(this);
		if (stats.description) {
			info += `<p class="mb-1"><b>${t('item.description')}: </b><span class="item-description">${stats.description} </span></p>`;
		}
		if (stats && stats.bonus) {
			if (stats.bonus.consume && Object.keys(stats.bonus.consume).length > 0) {
				var consumeBonus = '';

				for (var i in stats.bonus.consume.playerAttribute) {
					var attrName = ige.game.data.attributeTypes[i] ? ige.game.data.attributeTypes[i].name : i;
					consumeBonus += `<p class="mb-2 ml-2">${attrName}: ${stats.bonus.consume.playerAttribute[i]}</p>`;
				}

				for (var i in stats.bonus.consume.unitAttribute) {
					var attrName = ige.game.data.attributeTypes[i] ? ige.game.data.attributeTypes[i].name : i;
					consumeBonus += `<p class="mb-2 ml-2">${attrName}: ${stats.bonus.consume.unitAttribute[i]}</p>`;
				}

				if (consumeBonus) {
					info += `<p class="mb-1"><b>${t('item.consumeBonuses')}: </b></p>`;
					info += consumeBonus;
				}
			}
			if (stats.bonus.passive && Object.keys(stats.bonus.passive).length > 0) {
				var passiveBonus = '';
				for (var i in stats.bonus.passive.playerAttribute) {
					var attrName = ige.game.data.attributeTypes[i] ? ige.game.data.attributeTypes[i].name : i;
					var value = stats.bonus.passive.playerAttribute[i] && stats.bonus.passive.playerAttribute[i].value || 0;
					var type = stats.bonus.passive.playerAttribute[i] && stats.bonus.passive.playerAttribute[i].type || '';
					if (type == 'percentage') {
						type = '%';
					} else {
						type = '';
					}
					passiveBonus += `<p class="mb-2 ml-2">${attrName}: ${value}${type}</p>`;
				}

				for (var i in stats.bonus.passive.unitAttribute) {
					var attrName = ige.game.data.attributeTypes[i] ? ige.game.data.attributeTypes[i].name : i;
					var value = stats.bonus.passive.unitAttribute[i] && stats.bonus.passive.unitAttribute[i].value || 0;
					var type = stats.bonus.passive.unitAttribute[i] && stats.bonus.passive.unitAttribute[i].type || '';
					if (type == 'percentage') {
						type = '%';
					} else {
						type = '';
					}
					passiveBonus += `<p class="mb-2 ml-2">${attrName}: ${value}${type}</p>`;
				}

				if (passiveBonus) {
					info += `<p class="mb-1"><b>${t('item.passiveBonuses')}: </b></p>`;
					info += passiveBonus;
				}
			}
		}
		for (var atributeId in stats.attributes) {
			var attribute = stats.attributes[atributeId];

			if (attribute && attribute.isVisible && attribute.isVisible.includes('itemDescription')) {
				info += '<p class="mb-1">';
				var value = null;
				if (attribute.dataType === 'time') {
					value = ige.game.secondsToHms(attribute.value);
				} else {
					var decimalPlace = parseInt(attribute.decimalPlaces) || 0;
					value = parseFloat(attribute.value).toFixed(decimalPlace);
				}
				info += `<b>${attribute.name}: </b>${value || 0}`;
				info += '</p>';
			}
		}

		if (stats && stats.cost) {
			var costHtml = '';
			for (var key in stats.cost.unitAttributes) {
				var attrName = ige.game.data.attributeTypes[key] ? ige.game.data.attributeTypes[key].name : key;
				costHtml += `<span>${attrName}: ${stats.cost.unitAttributes[key]}</span>,`;
			}
			for (var key in stats.cost.playerAttributes) {
				var attrName = ige.game.data.attributeTypes[key] ? ige.game.data.attributeTypes[key].name : key;
				costHtml += `<span>${attrName}: ${stats.cost.playerAttributes[key]}</span>,`;
			}

			if (costHtml) {
				info += `<p class="mb-1"><b>${t('item.cost')}: </b>`;
				info += costHtml;
				info += '</p>';
			}
		}

		// if (stats.type === 'weapon')
		// {
		// 	info += '<p><b>Damage: </b>' + stats.damage + '</p>';
		// }
		info += '</div>';
		return info;
	},
	getAttrStr: function (attrName, itemValue) {
		if (itemValue != 0 && itemValue != undefined) {
			var attrStr;
			var t = this._t.bind(this);
			switch (attrName) {
				// case 'isGun': attrStr = "<strong>Weapon type:</strong> "+((value == true)? "Range":"Melee"); break;
				case 'price':
					if (typeof itemValue !== 'object' || itemValue === {}) {
						attrStr = `<strong>${t('item.price')}:</strong> ${t('item.free')}`;
					} else {
						attrStr = '';
						for (var attrKey in itemValue) {
							attrStr += `<strong>${t('item.price')}:</strong> ${itemValue[attrKey]}`;
						}
					}
					break;
				case 'ammoSize': attrStr = `<strong>${t('item.magazineSize')}:</strong> ${itemValue}`; break;
				case 'ammoTotal': attrStr = `<strong>${t('item.ammoTotal')}:</strong> ${itemValue}`; break;
				case 'fireRate': attrStr = `<strong>${t('item.fireRate')}:</strong> ${parseFloat(1000 / itemValue).toFixed(2)} ${t('item.roundsPerSecond')}`; break;
				case 'reloadRate': attrStr = `<strong>${t('item.reloadTime')}:</strong> ${parseFloat(itemValue / 1000).toFixed(2)} s`; break;
				case 'bulletForce': attrStr = `<strong>${t('item.knockbackForce')}:</strong> ${parseFloat(itemValue).toFixed(0)}`; break;
				case 'bulletDistance': attrStr = `<strong>${t('item.range')}:</strong> ${parseFloat(itemValue).toFixed(0)}`; break;
				case 'recoilForce': attrStr = `<strong>${t('item.recoil')}:</strong> ${parseFloat(itemValue).toFixed(0)}`; break;
				case 'movementSpeed': attrStr = `<strong>${t('item.speedBonus')}:</strong> ${parseFloat(itemValue.toFixed(1))}`; break;
				case 'immunity': attrStr = `<strong>${t('item.immunityBonus')}:</strong> ${parseFloat(itemValue * 100).toFixed(0)}%`; break;
				case 'maxStamina': attrStr = `<strong>${t('item.staminaBonus')}:</strong> ${parseFloat(itemValue.toFixed(0))}`; break;
				case 'stunChance': attrStr = `<strong>${t('item.slowTargetChance')}:</strong> ${parseFloat(itemValue * 100).toFixed(0)}%`; break;
				case 'slowChance': attrStr = `<strong>${t('item.stunTargetChance')}:</strong> ${parseFloat(itemValue * 100).toFixed(0)}%`; break;
			}

			return attrStr;
		}
	},

	// get buff list
	getBuffList: function (itemStats) {
		// console.log("getBuffList", itemStats)
		var buffCount = 0;
		var buffListHtml = $('<ul/>', {
			class: 'list-group'
		});

		if (itemStats && itemStats.buffTypes) {
			for (var i = 0; i < itemStats.buffTypes.length; i++) {
				var buffTypeName = itemStats.buffTypes[i];
				var itemValue = itemStats[buffTypeName];
				var itemType = ige.game.getAsset('itemTypes', itemStats.itemTypeId);

				var defaultValue = 0;

				if (itemType) {
					var defaultValue = itemType[buffTypeName] || 0;
				}

				var buffType = ige.game.getAsset('buffTypes', buffTypeName);

				if (buffType) {
					var isPercentageBased = buffType.unit == 'percentage';
				}

				if (itemValue != defaultValue && itemValue != 0 && itemValue != undefined && defaultValue != undefined) {
					switch (buffTypeName) {
						case 'height': buffTypeName = '<strong>Height bonus:</strong> '; break;
						case 'ammoSize': buffTypeName = '<strong>Magazine size:</strong> '; break;
						case 'ammoTotal': buffTypeName = '<strong>Ammo total:</strong> '; break;
						case 'fireRate': buffTypeName = '<strong>Fire rate:</strong> '; break;
						case 'reloadRate': buffTypeName = '<strong>Reload time:</strong> '; break;
						case 'bulletForce': buffTypeName = '<strong>Knock-back force:</strong> '; break;
						case 'bulletDistance': buffTypeName = '<strong>Range:</strong> '; break;
						case 'recoilForce': buffTypeName = '<strong>Recoil:</strong> '; break;
						case 'movementSpeed': buffTypeName = '<strong>Speed bonus:</strong> '; break;
						case 'immunity': buffTypeName = '<strong>Immunity bonus:</strong> '; break;
						case 'maxStamina': buffTypeName = '<strong>Stamina bonus:</strong> '; break;
						case 'stunChance': buffTypeName = '<strong>Slow target chance:</strong> '; break;
						case 'slowChance': buffTypeName = '<strong>Stun target chance:</strong> '; break;
					}

					if (isPercentageBased) {
						if (defaultValue == 0) {
							var itemValueHtml = `${(itemValue * 100).toFixed(0)}%`;
						} else {
							var itemValueHtml = `${((itemValue - defaultValue) / defaultValue * 100).toFixed(0)}%`;
						}
					} else {
						var itemValueHtml = (itemValue - defaultValue).toFixed(1);
					}
					buffListHtml.append(
						$('<li/>', {
							class: 'list-group-item',
							html: `${buffTypeName} <span class='badge badge-default' style='margin-left:4px'>${itemValueHtml}</span>`
						})
					);
					// console.log("itemStats",itemStats)
					buffCount++;
				}
			}
		}

		var data = {
			name: 'Normal',
			css: 'badge badge-pill badge-default'
		};

		if (buffCount > 4) {
			data = {
				name: 'Legendary',
				css: 'badge badge-pill badge-danger'
			};
		} else if (buffCount > 2) {
			data = {
				name: 'Rare',
				css: 'badge badge-pill badge-warning'
			};
		} else if (buffCount > 0) {
			data = {
				name: 'Special',
				css: 'badge badge-pill badge-primary'
			};
		}

		// data.html = buffListHtml

		return '';
	}
});

if (typeof (module) !== 'undefined' && typeof (module.exports) !== 'undefined') {
	module.exports = ItemUiComponent;
}
