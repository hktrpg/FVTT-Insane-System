/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class InsaneActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["insane", "sheet", "actor"],
      template: "systems/insane/templates/actor-sheet.html",
      width: 800,
      height: 800,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}],
      dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options) {
    let isOwner = false;
    let isEditable = this.isEditable;
    let data = super.getData(options);
    let items = {};
    let actorData = {};

    isOwner = this.document.isOwner;
    isEditable = this.isEditable;

    // The Actor's data
    actorData = this.actor.data.toObject(false);
    data.actor = actorData;
    data.data = actorData.data;

    // Owned Items
    data.items = actorData.items;
    for ( let i of data.items ) {
      const item = this.actor.items.get(i._id);
      i.labels = item.labels;
    }
    data.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    
    
    data.dtypes = ["String", "Number", "Boolean"];

    data.data.tables = [];
    for (var i = 2; i <= 12; ++i) {
        data.data.tables.push({line: [], number: i});
        for (var j = 0; j < 6; ++j) {
            var name = String.fromCharCode(65 + j);
            data.data.tables[i - 2].line.push({ id: `col-${j}-${i-2}`, title: `INSANE.${name}${i}`, name: `data.talent.table.${j}.${i - 2}`, state: data.data.talent.table[j][i - 2].state, num: data.data.talent.table[j][i - 2].num, fear: data.data.talent.table[j][i - 2].fear });
        }
    }

    actorData.abilityList = [];
    actorData.bondList = [];
    actorData.itemList = [];

    for (let i of data.actor.items) {
        if (i.type === 'ability')
            actorData.abilityList.push(i);
        else if (i.type == 'bond')
            actorData.bondList.push(i);
        else
            actorData.itemList.push(i);
    }

    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    html.find(".talent-name").on('mousedown', this._onRouteTalent.bind(this));

    // Owned Item management
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.getOwnedItem(li.data("itemId"));
      item.sheet.render(true);
    });

    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.deleteOwnedItem(li.data("itemId"));
      li.slideUp(200, () => this.render(false));
    });


    // Talent
    html.find('.item-label').click(this._showItemDetails.bind(this));
    html.find(".echo-item").click(this._echoItemDescription.bind(this));

    // Use Item
    html.find(".use-item").click(this._useItem.bind(this));

    if (this.actor.owner) {
      let handler = ev => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }

  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options={}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".sheet-body");
    const bodyHeight = position.height - 500;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    let target = event.currentTarget;

    console.log(this.actor);
    if (target == undefined || target.name.indexOf("data.talent") == -1)
      return await this.object.update(formData);

    await this.object.update(formData);

    let table = this._getTalentTable();
    for (var i = 0; i < 6; ++i)
    for (var j = 0; j < 11; ++j)
      formData[`data.talent.table.${i}.${j}.num`] = table[i][j].num;

    return await this.object.update(formData);
  }


  /* -------------------------------------------- */
  
  async _onRouteTalent(event) {
    if (event.button == 2 || event.which == 3)
      this._setFearTalent(event);
    else
      this._onRollTalent(event);
  }
  
  async _setFearTalent(event) {
    event.preventDefault();
    let table = duplicate(this.actor.data.data.talent.table);
    
    let dataset = event.currentTarget.dataset;
    let id = dataset.id.split("-");
    
    table[id[1]][id[2]].fear = !table[id[1]][id[2]].fear;
    
    await this.actor.update({"data.talent.table": table});
    console.log(this.actor);
  }

  async _onRollTalent(event) {
    event.preventDefault();
    let dataset = event.currentTarget.dataset;
    let num = dataset.num;
    let title = dataset.title;
    
    let fear = this.actor.data.data.talent.fear;
    if (fear && dataset.fear)
      num = String(Number(num) + 2);

    // GM rolls.
    let chatData = {
        user: game.user._id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: "<h2>" + title + "</h2>"
    };

    let rollMode = game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData["whisper"] = [game.user._id];
    if (rollMode === "blindroll") chatData["blind"] = true;

    let roll = new Roll("2d6");
    roll.roll();
    chatData.content = await renderTemplate("systems/insane/templates/roll.html", {
        formula: roll.formula,
        flavor: null,
        user: game.user._id,
        tooltip: await roll.getTooltip(),
        total: Math.round(roll.total * 100) / 100,
        num: num
    });

    if (game.dice3d) {
        game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind).then(displayed => ChatMessage.create(chatData));;
    } else {
        chatData.sound = CONFIG.sounds.dice;
        ChatMessage.create(chatData);
    }

  }


    /* -------------------------------------------- */
  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemCreate(event) {
    console.log(event);

    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;

    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type
    };
    return this.actor.createOwnedItem(itemData);
  }

  _showItemDetails(event) {
    event.preventDefault();
    const toggler = $(event.currentTarget);
    const item = toggler.parents('.item');
    const description = item.find('.item-description');

    toggler.toggleClass('open');
    description.slideToggle();
  }

  _echoItemDescription(event) {
    event.preventDefault();
    const itemDocument = $(event.currentTarget).parents('.item');
    const itemId = itemDocument[0].dataset.itemId;
    
    const item = this.actor.items.get(itemId);

    let title = item.data.name;
    let description = item.data.data.description;

    if (item.data.type == 'ability') {
      if (item.data.img != 'icons/svg/mystery-man.svg')
        title = `<img src="${item.data.img}" width="40" height="40">&nbsp&nbsp${title}` 

      description = `<table style="text-align: center;">
                      <tr>
                        <th>${game.i18n.localize("INSANE.Type")}</th>
                        <th>${game.i18n.localize("INSANE.Talent")}</th>
                      </tr>

                      <tr>
                        <td>${item.data.data.type}</td>
                        <td>${item.data.data.talent}</td>
                      </tr>
                    </table>${description}`
    }

    else if (item.data.type == 'bond') {
      if (item.data.img != 'icons/svg/mystery-man.svg')
        title = `<img src="${item.data.img}" width="40" height="40">&nbsp&nbsp${title}` 

      description = `<table style="text-align: center;">
                      <tr>
                        <th>${game.i18n.localize("INSANE.Residence")}</th>
                        <th>${game.i18n.localize("INSANE.Secret")}</th>
                        <th>${game.i18n.localize("INSANE.Feeling")}</th>
                      </tr>

                      <tr>
                        <td>${(item.data.data.residence) ? "O" : "X"}</td>
                        <td>${(item.data.data.secret) ? "O" : "X"}</td>
                        <td>${item.data.data.feeling}</td>
                      </tr>
                    </table>${description}`
    }
    
    else if (item.data.type == "item") {
      if (item.data.img != 'icons/svg/mystery-man.svg')
        title = `<img src="${item.data.img}" width="40" height="40">&nbsp&nbsp${title} X ${item.data.data.quantity}` 
    }
    
    // GM rolls.
    let chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: "<h2>" + title + "</h2>" + description
    };

    ChatMessage.create(chatData);

  }

  async _useItem(event) {
    event.preventDefault();
    const useButton = $(event.currentTarget);
    const item = this.actor.getOwnedItem(useButton.parents('.item')[0].dataset.itemId);

    if (item.data.data.quantity > 0) {
      await item.update({'data.quantity': item.data.data.quantity - 1});
  
      // GM rolls.
      let chatData = {
        user: game.user._id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: "<h3>" + game.i18n.localize("INSANE.UseItem") + ": " + item.data.name + "</h3>"
      };
  
      let rollMode = game.settings.get("core", "rollMode");
      if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
      if (rollMode === "selfroll") chatData["whisper"] = [game.user._id];
      if (rollMode === "blindroll") chatData["blind"] = true;
  
      ChatMessage.create(chatData);

    }
  
  }

  _getTalentTable() {
    let table = JSON.parse(JSON.stringify(this.actor.data.data.talent.table));
    let curiosity = this.actor.data.data.talent.curiosity;
    let nodes = [];

    for (var i = 0; i < 6; ++i)
    for (var j = 0; j < 11; ++j) {
      if (table[i][j].state == true) {
        nodes.push({x: i, y: j});
        table[i][j].num = "5";
      } else
        table[i][j].num = "12";
    }
        

    let dx = [0, 0, 1, -1];
    let dy = [1, -1, 0, 0];
    let move = [1, 1, 2, 2];
    for (var i = 0; i < nodes.length; ++i) {
      let queue = [nodes[i]];

      while (queue.length != 0) {
        let now = queue[0];
        queue.shift();

        for (var d = 0; d < 4; ++d) {
          var nx = now.x + dx[d];
          var ny = now.y + dy[d];
          var m = move[d];

          if (nx < 0 || nx >= 6 || ny < 0 || ny >= 11)
            continue;

          if (m == 2 && (nx == curiosity - 1 || now.x == curiosity - 1))
            m = 1;

          if (Number(table[nx][ny].num) > Number(table[now.x][now.y].num) + m) {
            table[nx][ny].num = String(Number(table[now.x][now.y].num) + m);
            queue.push({x: nx, y: ny});
          }
        }
      }
    }

    return table;
  }

}
