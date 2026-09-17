/**
 * What the player can *do*, in one list.
 *
 * Three things read this and nothing else describes a move: `core/Input.js`
 * builds its key map from the entries marked `attack` (so a rebind here rebinds
 * the game), `ui/ActionHUD.js` draws the panels along the bottom of the screen
 * from all of them, and `core/App.js` resolves a state per `id` each frame.
 *
 * `id` is the contract between the three. For an attack it is also the
 * `configKey` its `Attack` instance reads out of `config/settings.js` — one
 * word that names the clip, its tuning block, its glyph in `ui/icons.js` and
 * its chip in the HUD.
 *
 * `category` is the second contract, and it is a statement about *kind*, not
 * about layout: a technique is something the body does with the sword and the
 * feet, an ability is something rarer that the body alone could not, and a buff
 * is not thrown at anybody at all — it is called down on yourself and carried.
 * The HUD gives each kind its own panel and its own heading so the difference
 * is visible before any of it is read — see `ui/ActionHUD.js`.
 */

/**
 * @typedef {object} Category
 * @property {string} id matches an ability's `category`
 * @property {string} label the panel's heading
 * @property {string} kanji the mark beside it
 * @property {'top'|'main'} row which band of the HUD the panel sits in
 */

/**
 * The kinds of thing a move can be, in the order their panels are laid out.
 *
 * @type {Record<string, Category>}
 */
export const CATEGORIES = {
  /**
   * Getting somewhere, and getting dressed. Quiet, above the rest — neither is
   * a way to hurt anyone, and neither should compete with the panels that are.
   */
  movement: { id: 'movement', label: '이동', kanji: '歩', row: 'top' },
  /** Sword and body. The three the fight is actually fought with. */
  technique: { id: 'technique', label: '기술', kanji: '技', row: 'main' },
  /**
   * The rarer things — asking for something rather than doing it.
   *
   * Both of them (`swordCombo`, `voidBeam`) are thrown at whoever is in front
   * of you exactly as a technique is, because what makes a move an ability here
   * is *what it calls on*, not how it is aimed.
   */
  ability: { id: 'ability', label: '술법', kanji: '術', row: 'main' },
  /**
   * The boons: called down on yourself and then carried for a while.
   *
   * The other panels are all a thing you do *to* somebody, and these two are
   * the only moves with nowhere to point them — what they change is the body
   * throwing them, and they keep changing it for ten seconds after the key is
   * let go. That is a different kind of move from "a thing that happens now",
   * so it is a panel of its own: while one is up its chip is a countdown, and a
   * player scanning for "how long have I got" should be reading one place.
   */
  buff: { id: 'buff', label: '가호', kanji: '加', row: 'main' }
};

/**
 * @typedef {object} Ability
 * @property {string} id matches the settings block, the `Attack` config key and the icon
 * @property {keyof typeof CATEGORIES} category which panel it is drawn in
 * @property {string} label what the chip says
 * @property {string} hotkey what the chip's key cap says
 * @property {string} code the physical `KeyboardEvent.code` behind it
 * @property {string} note one line, for the chip's tooltip
 * @property {boolean} [attack] buffered as an edge and routed to an `Attack`
 * @property {boolean} [press] the chip is a control as well as a readout — it
 *   can be clicked, and the click means the same as the key. Only for the ones
 *   that are a plain switch: anything aimed has to be aimed, and a button
 *   cannot say where.
 */

/** @type {Ability[]} */
export const ABILITIES = [
  {
    id: 'leap',
    category: 'movement',
    label: '도약',
    hotkey: 'Space',
    code: 'Space',
    note: '달리기 속도에서 길게 점프합니다. 그 이하 속도에서는 짧은 hop이 됩니다.'
  },
  {
    id: 'weapon',
    category: 'movement',
    // Rewritten each frame with the name of what is actually in the hand, so
    // the chip is the answer to "what am I holding" as well as the way to
    // change it — see `ActionHUD#setLabel`.
    label: '도검',
    hotkey: '1',
    code: 'Digit1',
    note: '무기 교체. 손에 든 무기는 연기로 사라지고 다른 무기가 연기로 나타납니다.',
    press: true
  },
  {
    id: 'shoulder',
    category: 'movement',
    // Rewritten each frame with the side the lens is actually on, so the chip
    // answers "which shoulder am I over" as well as changing it.
    label: '오른쪽 어깨',
    hotkey: 'H',
    code: 'KeyH',
    note:
      '카메라를 반대쪽 어깨로 옮깁니다. 소총을 들고 있을 때만 의미가 있습니다. ' +
      '마우스 휠 클릭으로도 같은 동작입니다.',
    press: true
  },
  {
    id: 'customize',
    category: 'movement',
    label: '캐릭터',
    hotkey: 'Tab',
    code: 'Tab',
    note: '장비실: 별도의 무대에서 캐릭터와 장비를 살펴봅니다.'
  },
  {
    id: 'kick',
    category: 'technique',
    label: '발차기',
    hotkey: 'E',
    code: 'KeyE',
    note: '바로 앞에 있는 가장 가까운 적에게 다가가 발을 박습니다.',
    attack: true
  },
  {
    id: 'slashHit',
    category: 'technique',
    label: '베기 일격',
    hotkey: 'R',
    code: 'KeyR',
    note: '몸을 들이대 허리를 가로지릅니다. 사거리가 길며 적을 두 토막으로 자릅니다.',
    attack: true
  },
  {
    id: 'crouchSlash',
    category: 'technique',
    label: '슬라이드 베기',
    hotkey: 'T',
    code: 'KeyT',
    note: '적을 향해 달리다 슬라이드로 몸을 낮추며 지나가는 길에 베어버립니다.',
    attack: true
  },
  {
    id: 'flipKick',
    category: 'technique',
    label: '플립 킥',
    hotkey: 'Q',
    code: 'KeyQ',
    note: '달려가 가슴에 발을 박고 뒤로 공중제비를 돌며 빠집니다. 탈출용 기술.',
    attack: true
  },
  {
    id: 'swordCombo',
    category: 'ability',
    label: '검격 연속',
    // Not `F`: that toggles the frame stats (`App`'s own key handler), and a
    // move that flipped a debug panel every time it was thrown would be the
    // kind of bug nobody reports because they assume they did it.
    hotkey: 'Z',
    code: 'KeyZ',
    note:
      '두 번의 참격을 지상으로 날린 뒤 어둠 속에서 달려나와 적을 해체합니다. ' +
      '사거리가 가장 길고, 가장 오래 묶입니다.',
    attack: true
  },
  {
    id: 'voidBeam',
    category: 'ability',
    label: '소멸',
    hotkey: 'B',
    code: 'KeyB',
    note:
      '서 있는 자리에서 가장 가까운 적에게 두 번 시전합니다. 첫 시전은 발 밑에 룬을 새기고, ' +
      '두 번째 시전은 그 위로 공허의 기둥을 솟구쳐 — 남는 건 아무것도 없습니다.',
    attack: true
  },
  {
    id: 'crimsonRite',
    category: 'ability',
    label: '진홍 의식',
    // The next free cap on the bottom row, beside the one the unmaking uses.
    // Both are casts thrown from where you stand, and a hand that has found one
    // of them has found the other.
    hotkey: 'V',
    code: 'KeyV',
    note:
      '가장 가까운 적을 표시하고 어둠 속에서 세 자루의 도검을 불러냅니다. ' +
      '한 자루씩 찌르고 함께 빼며, 빠져나오는 것은 더 이상 서 있지 않습니다.',
    attack: true
  },
  {
    id: 'shadowExecution',
    category: 'ability',
    label: '그림자 처형',
    // The last free cap on the row the other two casts already hold. B and V
    // are taken; C finishes the run, and a hand that has found either of them
    // has found this one.
    hotkey: 'C',
    code: 'KeyC',
    note:
      '가장 가까운 적을 표시하고 다섯 자루의 도검을 불러냅니다. 빙글빙글 돌다가 ' +
      '한꺼번에 찔러 넣으며, 빠져나오는 것은 넘어지지 않고 해체됩니다.',
    attack: true
  },
  {
    id: 'ascendance',
    category: 'buff',
    // Rewritten each frame while the boon is up with the seconds left on it,
    // so the chip is the timer as well as the key — see `App#_syncAbilities`.
    label: '승천',
    // The next cap along from the ones the abilities already hold — B is taken,
    // and this one is on the same row, where the hand finds it without being
    // told where it is. N and M sit together because the boons do.
    hotkey: 'N',
    code: 'KeyN',
    note:
      '자신에게 빛을 내려보냅니다. 10초간 이동이 빨라지고 모든 공격이 강해집니다. ' +
      '대상을 겨냥하지 않습니다 — 가호입니다.',
    // Nothing to aim, so a click can mean it: there is nowhere to point it, and
    // therefore nothing a chip would have to be able to say. Both boons are
    // pressable for the same reason.
    press: true
  },
  {
    id: 'shadowBoost',
    category: 'buff',
    // Rewritten each frame while the boon is up with the seconds left on it,
    // exactly as `ascendance` is — see `App#_syncAbilities`.
    label: '그림자 강화',
    // The next cap along again. B and N are taken, and M finishes the row the
    // hand is already on.
    hotkey: 'M',
    code: 'KeyM',
    note:
      '발 밑에서 어둠을 솟구쳐 올립니다. 10초간 모든 공격이 파괴적으로 바뀝니다. ' +
      '대상을 겨냥하지 않는 두 번째 가호입니다.',
    // The second boon, so the second chip a click can mean. Same reason as
    // above: there is nowhere to point it.
    press: true
  }
];

/** The attacks, in the order a press is offered to them. */
export const ATTACK_ABILITIES = ABILITIES.filter((ability) => ability.attack);
