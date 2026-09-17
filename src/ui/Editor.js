import GUI from 'lil-gui';
import { settings } from '../config/settings.js';
import { LITTER_CELLS } from '../world/LeafLitter.js';
import { PresetManager } from './PresetManager.js';

/**
 * Real-time stage editor.
 *
 * Every control binds straight to a field in `config/settings.js`. Because the
 * lights, the floor shader, the dust, the camera rig and the post stack all
 * *read* those fields each frame, no controller needs an onChange handler:
 * moving a slider re-lights the scene on the next frame, with no rebuild and no
 * shader recompilation.
 *
 * That holds while the clock is paused (`P`) — which is the point, since the
 * pose worth lighting is usually a frozen one. The two exceptions are noted
 * where they occur: the floor's stone maps flip a shader define, and the
 * character's scale is resolved once at load.
 */
export class Editor {
  /**
   * @param {object} hooks { onToast, onRespawnEnemies, onCastAscendance,
   *   onCastShadowBoost }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.presets = new PresetManager();

    this.gui = new GUI({ title: '스테이지 에디터', width: 330 });
    this.gui.domElement.style.setProperty('--title-height', '30px');

    this._presetState = { name: 'My preset', selected: this.presets.names[0] ?? '' };
    this._hidden = false;

    this._buildPresets();
    this._buildEnvironment();
    this._buildAir();
    this._buildTerrain();
    this._buildLeaves();
    this._buildAscendance();
    this._buildShadowBoost();
    this._buildPost();
    this._buildCamera();
    this._buildCharacter();
    this._buildLocomotion();
    this._buildWeapons();
    this._buildGunplay();
    this._buildCombat();
    this._buildStudio();

    // Everything starts collapsed, top-level folders included: the panel opens
    // as a list of sections and the user picks one.
    this.gui.foldersRecursive().forEach((folder) => folder.close());
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  static range(folder, object, key, min, max, step, label) {
    return folder.add(object, key, min, max, step).name(label ?? key);
  }

  /** Re-read every control from settings — after a preset load or a reset. */
  refresh() {
    this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  }

  /** @returns {boolean} whether the panel is now on screen */
  toggle() {
    this._hidden = !this._hidden;
    this.gui.show(!this._hidden);
    return !this._hidden;
  }

  /* ------------------------------------------------------------------ */
  /* folders                                                             */
  /* ------------------------------------------------------------------ */

  _buildPresets() {
    const folder = this.gui.addFolder('프리셋');
    const state = this._presetState;

    let selector = folder
      .add(state, 'selected', this.presets.names.length ? this.presets.names : [''])
      .name('프리셋');

    // lil-gui rebuilds the controller when the option list changes, so the
    // reference has to be replaced rather than mutated.
    const refreshOptions = () => {
      const names = this.presets.names;
      selector = selector.options(names.length ? names : ['']).name('프리셋');
      selector.setValue(names.includes(state.selected) ? state.selected : (names[0] ?? ''));
    };

    folder.add(state, 'name').name('이름');

    folder
      .add(
        {
          save: () => {
            this.presets.save(state.name);
            state.selected = state.name;
            refreshOptions();
            this.hooks.onToast?.(`Saved preset "${state.name}"`);
          }
        },
        'save'
      )
      .name('프리셋 저장');

    folder
      .add(
        {
          load: () => {
            if (this.presets.load(state.selected)) {
              this.refresh();
              this.hooks.onToast?.(`Loaded "${state.selected}"`);
            }
          }
        },
        'load'
      )
      .name('프리셋 불러오기');

    folder
      .add(
        {
          duplicate: () => {
            const copy = this.presets.duplicate(state.selected);
            if (copy) {
              state.selected = copy;
              refreshOptions();
              this.hooks.onToast?.(`Duplicated to "${copy}"`);
            }
          }
        },
        'duplicate'
      )
      .name('복제');

    folder
      .add(
        {
          remove: () => {
            if (this.presets.remove(state.selected)) {
              refreshOptions();
              this.hooks.onToast?.('Preset deleted');
            }
          }
        },
        'remove'
      )
      .name('삭제');

    folder
      .add({ exportOne: () => this.presets.exportJSON() }, 'exportOne')
      .name('현재 프리셋 내보내기 (JSON)');
    folder.add({ exportAll: () => this.presets.exportAll() }, 'exportAll').name('모든 프리셋 내보내기');

    folder
      .add(
        {
          import: async () => {
            const result = await this.presets.importFromFile();
            refreshOptions();
            this.refresh();
            this.hooks.onToast?.(
              result.applied
                ? 'Settings imported'
                : result.imported.length
                  ? `Imported ${result.imported.length} preset(s)`
                  : 'Nothing imported'
            );
          }
        },
        'import'
      )
      .name('JSON 가져오기…');

    folder
      .add(
        {
          reset: () => {
            this.presets.reset();
            this.refresh();
            this.hooks.onToast?.('기본값으로 초기화');
          }
        },
        'reset'
      )
      .name('기본값으로 초기화');

    this.presetFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  _buildEnvironment() {
    const folder = this.gui.addFolder('환경');
    const e = settings.environment;
    const R = Editor.range;

    // The key and the rim are the character's own lights. three cannot exclude
    // an object from a light, so the world's surfaces are patched to drop every
    // directional light instead — see `Environment#excludeFromKeyLights`. Off,
    // and the pair go back to lighting the whole landscape.
    folder.add(e, 'keyCharacterOnly').name('키/림 라이트: 캐릭터만');
    R(folder, e, 'sunIntensity', 0, 8, 0.01, '키 라이트 강도');
    folder.addColor(e, 'sunColor').name('키 라이트 색상');
    R(folder, e, 'sunAzimuth', 0, Math.PI * 2, 0.01, '키 라이트 방위각');
    R(folder, e, 'sunElevation', 0.05, 1.5, 0.01, '키 라이트 고도');
    R(folder, e, 'ambientIntensity', 0, 3, 0.01, '환경광');
    folder.addColor(e, 'ambientColor').name('환경광 색상');
    R(folder, e, 'hemiIntensity', 0, 3, 0.01, '반구광 강도');
    R(folder, e, 'envIntensity', 0, 3, 0.01, '환경맵(IBL)');
    R(folder, e, 'shadowRadius', 0, 8, 0.05, '그림자 부드러움');
    R(folder, e, 'shadowBias', -0.01, 0.001, 0.0001, '그림자 바이어스');
    // The pair the character screen has always had and this one did not. Bias
    // works in depth and has to be re-dialled whenever `shadow box` moves; the
    // normal bias is in metres of world and does not. Speckle on a lit surface
    // wants this one raised, a shadow detaching from its feet wants it lowered.
    R(folder, e, 'shadowNormalBias', 0, 0.15, 0.001, '그림자 노멀 바이어스');
    R(folder, e, 'contactShadow', 0, 1.5, 0.01, '접촉 그림자');
    // Half-width of the sun's shadow box. Bigger reaches further out for
    // casters and costs sharpness — the map is a fixed 4096², so this is
    // metres per texel in disguise. The distance below only has to be far
    // enough up-sun to clear the canopy; at a low elevation that is a long way.
    R(folder, e, 'shadowExtent', 12, 120, 1, '그림자 영역(m)');
    R(folder, e, 'shadowDistance', 40, 400, 5, '태양 거리(m)');

    const rim = folder.addFolder('림 라이트');
    R(rim, e, 'rimIntensity', 0, 4, 0.01, '림 라이트 강도');
    rim.addColor(e, 'rimColor').name('림 색상');
    R(rim, e, 'rimAzimuth', 0, Math.PI * 2, 0.01, '림 라이트 방위각');
    R(rim, e, 'rimElevation', 0.05, 1.5, 0.01, '림 라이트 고도');
    rim.addColor(e, 'hemiSkyColor').name('반구광 하늘');
    rim.addColor(e, 'hemiGroundColor').name('반구광 바운스');

    // `tiled surface` flips USE_MAP, so it costs one shader recompile — fine for
    // an editor toggle, and free while it stays put. Switching sets downloads
    // the other one the first time it is picked.
    const floor = folder.addFolder('무대 바닥');
    floor.add(e, 'floorTexture').name('타일 표면');
    floor.add(e, 'floorTextureSet', ['terrain', 'stone']).name('표면');
    R(floor, e, 'floorTextureScale', 0.5, 24, 0.1, '타일 크기(m)');
    R(floor, e, 'floorNormalScale', 0, 3, 0.01, '요철 강도');
    R(floor, e, 'floorTexTint', 0, 1, 0.01, '바닥 톤 섞기');
    floor.addColor(e, 'floorColor').name('바닥 색상');
    floor.addColor(e, 'floorTint').name('바닥 톤');
    R(floor, e, 'floorRoughness', 0.05, 1, 0.01, '거칠기');
    R(floor, e, 'floorSheen', 0, 1, 0.01, '광택');
    R(floor, e, 'floorPool', 0, 1, 0.01, '빛 웅덩이');
  }

  /* ------------------------------------------------------------------ */

  /**
   * Haze, sky and ground mist — one look, in one folder.
   *
   * They are together because they cannot be tuned apart. The sky's horizon *is*
   * the haze colour (bound by identity, which is why there is no control for it
   * under Sky); the mist is lit from the same moon direction the haze glows
   * along, and the moon's own angles live under Sky; and the ground fog's job is
   * to sit in front of a distance the haze has already dissolved. Move one and
   * the others are suddenly wrong.
   */
  _buildAir() {
    const folder = this.gui.addFolder('대기, 하늘, 안개');
    const R = Editor.range;

    const h = settings.haze;
    const haze = folder.addFolder('원거리 헤이즈');
    haze.add(h, 'enabled').name('헤이즈 켜기');
    haze.addColor(h, 'color').name('헤이즈 색상');
    haze.addColor(h, 'sunColor').name('달빛 방향 색상');
    // 1/m, so the number itself means very little; the readout under it is what
    // you actually aim.
    R(haze, h, 'density', 0, 0.03, 0.0002, '원거리 헤이즈(1/m)');
    R(haze, h, 'start', 0, 40, 0.5, '맑은 공기 거리(m)');
    haze
      .add(
        {
          get halfAt() {
            const d = settings.haze.density;
            return d > 1e-5 ? Math.round(Math.LN2 / d + settings.haze.start) : 9999;
          }
        },
        'halfAt'
      )
      .name('절반 가려지는 거리(m)')
      .listen()
      .disable();
    // The layer that pools in the hollows. `mist floor` is the world height it
    // sits on and `mist depth` is how fast it thins going up — between them
    // they decide whether it is a ground effect or a wall.
    R(haze, h, 'ground', 0, 0.12, 0.001, '지면 안개(1/m)');
    R(haze, h, 'base', -12, 12, 0.1, '안개 바닥(m)');
    R(haze, h, 'falloff', 0.5, 40, 0.1, '안개 두께(m)');
    // How far the air goes toward the moon's colour looking down the beam. The
    // highest-value control in this folder: at 0 the haze is a flat wash from
    // every angle, which is the one thing real air never is.
    R(haze, h, 'inscatter', 0, 1, 0.01, '달빛 산란');
    R(haze, h, 'sunPower', 1, 24, 0.1, '산란 집중도');
    R(haze, h, 'max', 0, 1, 0.01, '헤이즈 상한');

    const s = settings.sky;
    const sky = folder.addFolder('하늘');
    sky.add(s, 'enabled').name('하늘 켜기');
    sky.addColor(s, 'zenith').name('천정');
    R(sky, s, 'gradient', 0.1, 3, 0.01, '그라디언트');
    R(sky, s, 'sunGlow', 0, 12, 0.05, '달 후광');
    R(sky, s, 'sunGlowPower', 1, 60, 0.5, '후광 집중도');
    R(sky, s, 'broadGlow', 0, 3, 0.01, '광역 광량');
    R(sky, s, 'exposure', 0, 3, 0.01, '하늘 노출');

    // The moon. `disc size` is 1 - cos of the half-angle, so the numbers look
    // small — 0.006 is about six degrees across, which is a dozen times life
    // size and exactly what the reference is.
    const moon = sky.addFolder('달');
    // Where it hangs — and the world's one light direction with it: the sky's
    // glare, the haze's inscatter lobe and the mist's lit side all resolve from
    // this pair (`Sky#_placeMoon` writes `frame.uLightDir`). The character's key
    // is a *different* angle, over in Environment.
    //
    // Elevation is capped low on purpose. The rig cannot aim much above 30°
    // (`camera.maxPolar`), so a moon parked higher than this is off the top of
    // the frame and only its glare is ever on screen — which is exactly why it
    // used to be invisible at the old 0.72.
    R(moon, s.moon, 'azimuth', 0, Math.PI * 2, 0.01, 'rotation (azimuth)');
    R(moon, s.moon, '고도', -0.05, 0.6, 0.005, '고도');
    R(moon, s, 'disc', 0, 40, 0.1, '밝기');
    R(moon, s, 'discSize', 0.0005, 0.05, 0.0005, '크기');
    moon.addColor(s.moon, 'color').name('색상');

    // The body — a displaced sphere wearing a real lunar surface material
    // (`world/Moon.js`). Off, and the sky goes back to drawing the disc itself,
    // which is the only thing the two `maria` sliders at the bottom still feed.
    const body = moon.addFolder('표면');
    body.add(s.moon, 'geometry').name('텍스처 본체');
    // The body's own two masters. `brightness` above is `sky.disc`, which is
    // also the glare's and what the haze's lobe is sized against — these two
    // are the ones to reach for when the sphere itself is too hot or too solid,
    // because they move it and nothing else. Both at 1 is untouched.
    R(body, s.moon, '밝기', 0, 3, 0.01, '본체 밝기');
    R(body, s.moon, '불투명도', 0, 1, 0.01, '본체 불투명도');
    // The one control here that changes the picture rather than the finish:
    // where the moon's *own* sun is, from full through half to new.
    R(body, s.moon, 'phase', 0, Math.PI, 0.01, '위상 (보름 → 초승)');
    R(body, s.moon, 'phaseTilt', -1.2, 1.2, 0.01, '위상 기울기');
    R(body, s.moon, 'terminator', 0.005, 0.5, 0.005, '명암 경계 부드러움');
    R(body, s.moon, 'flatten', 0.1, 2, 0.01, '가장자리 평탄도');
    R(body, s.moon, '지구광', 0, 0.4, 0.005, '지구광');
    R(body, s.moon, 'edge', 0.001, 0.4, 0.001, '가장자리 페이드');
    R(body, s.moon, 'displacement', 0, 0.25, 0.005, '요철 (지오메트리)');
    R(body, s.moon, 'relief', 0, 1, 0.01, '요철 (법선)');
    R(body, s.moon, 'ao', 0, 1, 0.01, '크레이터 그림자(AO)');
    R(body, s.moon, '광택', 0, 0.5, 0.005, '광택');
    R(body, s.moon, 'textureScale', 0.2, 6, 0.05, '크레이터 크기');
    R(body, s.moon, 'blendSharpness', 1, 16, 0.5, '투영 블렌드');
    R(body, s.moon, 'tilt', -Math.PI, Math.PI, 0.01, '면 기울기');
    R(body, s.moon, 'spin', -Math.PI, Math.PI, 0.01, '면 회전');

    // Fallback disc only: with the body up, `Sky` is not drawing a disc at all.
    R(moon, s.moon, 'detail', 0, 1, 0.01, '달의 바다 (디스크만)');
    R(moon, s.moon, 'detailScale', 1, 24, 0.1, '달의 바다 크기 (디스크만)');

    // One hash per lattice cell, so the whole sky of them is about the price of
    // a single texture lookup. `density` is cells per unit direction: up packs
    // more in and shrinks each one.
    const stars = sky.addFolder('별');
    const st = s.stars;
    stars.add(st, 'enabled').name('별 켜기');
    R(stars, st, 'density', 40, 600, 5, '밀도');
    R(stars, st, 'brightness', 0, 6, 0.05, '밝기');
    R(stars, st, 'twinkle', 0, 1, 0.01, '반짝임');
    R(stars, st, 'horizon', 0, 0.6, 0.01, 'gone below (sin elev)');

    this._buildGroundFog(folder);
  }

  /**
   * The mist that rolls over the ground — see `world/GroundFog.js`.
   *
   * A sub-folder of the air rather than a folder of its own, because it is the
   * near half of the same effect: the haze above dissolves the distance, and
   * this puts something between you and it that has a shape and moves.
   *
   * Everything here is live. `count` is the only control that touches a buffer,
   * and even that only reveals or hides slots that were allocated at boot — the
   * mist never rebuilds.
   */
  _buildGroundFog(parent) {
    const folder = parent.addFolder('지면 안개 (방출원)');
    const f = settings.groundFog;
    const R = Editor.range;

    folder.add(f, 'enabled').name('켜기');
    // Density is `count` against `life`: a slot respawns the instant it dies, so
    // the emitter is releasing count/life puffs a second. `count` is also the
    // fill-rate dial — it is the first thing to turn down if the frame is tight.
    R(folder, f, 'count', 0, 512, 1, '안개 입자 수 (비용)');
    R(folder, f, 'life', 1, 60, 0.5, '수명 (초)');
    R(folder, f, 'lifeVariance', 0, 0.95, 0.01, '수명 편차');
    R(folder, f, 'opacity', 0, 1, 0.01, '불투명도');

    // Where it comes from. `follow` parks the emitter on the character, which is
    // what keeps mist around the camera on an endless floor; off, x/z are a
    // fixed world position and the bank stays in the hollow you put it in.
    const emitter = folder.addFolder('방출원');
    emitter.add(f, 'follow').name('캐릭터 따라가기');
    R(emitter, f, 'x', -200, 200, 0.5, 'X / 오프셋 X (m)');
    R(emitter, f, 'z', -200, 200, 0.5, 'Z / 오프셋 Z (m)');
    R(emitter, f, 'radius', 0, 120, 0.5, '생성 반경 (m)');
    // The hole kept clear around the lens. Nothing else in this panel can fix a
    // puff sitting between you and the character: raise this until the closest
    // mist is behind the camera's own distance to them.
    R(emitter, f, 'nearFade', 0, 40, 0.25, '카메라로부터 비움 (m)');
    R(emitter, f, 'nearFadeRange', 0.5, 40, 0.25, '비움 구간 (m)');

    const drift = folder.addFolder('표류');
    R(drift, f, 'windX', -8, 8, 0.05, '바람 X (m/s)');
    R(drift, f, 'windZ', -8, 8, 0.05, '바람 Z (m/s)');
    R(drift, f, 'rise', -1, 2, 0.01, '상승 (m/s)');
    R(drift, f, 'hover', -1, 8, 0.05, '지면 위 떠있음 (m)');
    R(drift, f, 'swirl', 0, 8, 0.05, '떠돌이 (m)');
    R(drift, f, 'swirlSpeed', 0, 1.5, 0.01, '떠돌이 속도');
    R(drift, f, 'spin', 0, 1, 0.005, '회전 (rad/s)');

    const look = folder.addFolder('외형');
    R(look, f, 'sizeStart', 0.2, 40, 0.1, '탄생 시 크기 (m)');
    R(look, f, 'sizeEnd', 0.2, 60, 0.1, '소멸 시 크기 (m)');
    look.addColor(f, 'color').name('안개 색상');
    look.addColor(f, 'litColor').name('달빛 방향 색상');
    R(look, f, 'moonlight', 0, 1.5, 0.01, '달빛');
    R(look, f, 'moonPower', 0.5, 12, 0.1, '달빛 집중도');
    R(look, f, 'softness', 0.02, 1, 0.01, '가장자리 부드러움');
    R(look, f, 'fadeIn', 0.01, 0.9, 0.01, '나타남 (수명 대비)');
    R(look, f, 'fadeOut', 0.01, 0.9, 0.01, '사라짐 (수명 대비)');
    // What hides the line where a billboard crosses the terrain. Too small and
    // the cut shows; too large and the mist floats off the ground.
    R(look, f, 'groundFade', 0.05, 8, 0.05, '지면과 섞임 (m)');
    R(look, f, 'detail', 0, 1, 0.01, '노이즈 분쇄');
    R(look, f, 'detailScale', 0.5, 12, 0.1, '분쇄 크기');
  }

  /* ------------------------------------------------------------------ */

  /**
   * The shape of the ground — see `world/Terrain.js`.
   *
   * Every control here is a shader uniform read by the floor *and* the CPU that
   * stands the character up, so the landscape can be redialled while walking
   * over it and the body keeps its feet on whatever comes out. The two that are
   * not free are called out below.
   */
  _buildTerrain() {
    const folder = this.gui.addFolder('지형');
    const t = settings.terrain;
    const R = Editor.range;

    folder.add(t, 'enabled').name('지형 켜기');
    R(folder, t, 'amplitude', 0, 20, 0.05, '높이 (m)');
    R(folder, t, 'scale', 8, 200, 1, '언덕 크기 (m)');
    // The one real cost dial: the floor evaluates this field five times per
    // vertex (the height and its normal), so an octave here is paid for by
    // every vertex of the grid.
    R(folder, t, 'octaves', 1, 6, 1, '디테일 (비용)');
    R(folder, t, 'warp', 0, 2, 0.01, '왜곡 (계곡)');
    R(folder, t, 'ridge', 0, 1, 0.01, '능선');

    const shape = folder.addFolder('미세 형태');
    R(shape, t, 'lacunarity', 1.5, 3, 0.01, '옥타브 배율');
    R(shape, t, 'gain', 0.2, 0.7, 0.01, '옥타브 감쇠');
    R(shape, t, 'seed', 0, 60, 0.1, '시드').listen();
    shape
      .add(
        {
          randomize: () => {
            t.seed = Math.random() * 60;
          }
        },
        'randomize'
      )
      .name('지형 무작위화');
    // The only control in this folder that rebuilds anything: it swaps the
    // floor's grid, which is a one-frame hitch and 400 m / segments of vertex
    // spacing. Below about 128 the hills go visibly faceted in silhouette.
    shape
      .add(t, 'segments', [64, 128, 192, 256, 384, 512, 768])
      .name('바닥 메시 디테일')
      .onChange((value) => {
        this.hooks.onToast?.(`Floor grid: ${(400 / value).toFixed(2)} m between vertices`);
      });
  }

  /**
   * The litter on the floor and the leaves in the air — see `world/Leaves.js`.
   *
   * One folder, because they are one look: the sheet, the grade, the backlight
   * and the wind at the top are shared by both populations by identity, and only
   * the two sub-folders differ. Everything here is live — the one control that
   * recompiles is the coverage switch, and it is called out where it sits.
   *
   * The control worth reaching for first is `backlight`. Leaves are one cell
   * thick and they glow when the moon is behind them; at 0 they are opaque chips
   * and the whole field reads as stickers on the ground.
   */
  _buildLeaves() {
    const folder = this.gui.addFolder('나뭇잎');
    const g = settings.leaves;
    const R = Editor.range;

    folder.add(g, 'enabled').name('나뭇잎 켜기');
    R(folder, g, 'size', 0.02, 0.6, 0.005, '잎 길이 (m)');
    R(folder, g, 'sizeVariance', 0, 0.9, 0.01, '크기 편차');

    // The sheet is a daylight photograph of a green beech and this stage is a
    // blue night. Without this the leaves are the one summer-coloured thing in
    // the frame.
    const look = folder.addFolder('톤 & 역광');
    look.addColor(g, 'tint').name('색조 섞기');
    R(look, g, 'tintAmount', 0, 1, 0.01, '색조 섞기 양');
    look.addColor(g, 'backlightColor').name('잎 통과 색상');
    R(look, g, 'backlight', 0, 3, 0.01, '역광');
    R(look, g, 'backlightPower', 1, 24, 0.5, '역광 집중도');
    R(look, g, 'roughness', 0.02, 1, 0.01, '거칠기');
    R(look, g, 'normalScale', 0, 3, 0.05, '요철 (법선)');

    // The cut-out. Lower is a fatter leaf and a rougher edge; the coverage
    // switch is what keeps that edge from crawling, and it is the only control
    // in this folder that recompiles. It does nothing until there is MSAA to
    // resolve against — raise `samples` under Post processing first.
    const cut = look.addFolder('잘라내기');
    R(cut, g, 'alphaTest', 0.05, 0.95, 0.01, '알파 컷오프');
    cut
      .add(g, 'alphaToCoverage')
      .name('부드러운 가장자리 (MSAA 필요)')
      .onChange((value) => {
        if (value && (settings.post.samples ?? 0) === 0) {
          this.hooks.onToast?.('Smooth leaf edges need post → samples above 0');
        }
      });
    R(cut, g, 'atlasInset', 0, 0.15, 0.005, '시트 여백');

    // One wind for both populations: it quivers the litter where it lies and
    // carries the leaves in the air, so a gust crosses the whole field at once.
    const wind = folder.addFolder('바람');
    R(wind, g, 'windX', -8, 8, 0.05, '바람 X (m/s)');
    R(wind, g, 'windZ', -8, 8, 0.05, '바람 Z (m/s)');
    R(wind, g, 'gustSpeed', 0, 3, 0.01, '돌풍 속도');
    R(wind, g, 'gustScale', 0.005, 0.4, 0.005, '돌풍 크기 (rad/m)');
    R(wind, g, 'gustStrength', 0, 3, 0.01, '돌풍 강도');

    /* ---- the ground ---- */
    const l = g.litter;
    const litter = folder.addFolder('낙엽 (지면)');
    litter.add(l, 'enabled').name('낙엽 켜기');
    // The two cost dials. Live like everything else — they only decide where
    // the leaves are laid out, so moving one re-lays the grid rather than
    // rebuilding a buffer. `perCell` × 400 is the leaf count.
    R(litter, l, 'perCell', 1, 20, 1, '셀당 개수 (비용)');
    R(litter, l, 'field', 20, 120, 1, '영역 (m)');
    litter
      .add(
        {
          get leaves() {
            return Math.round(settings.leaves.litter.perCell) * LITTER_CELLS * LITTER_CELLS;
          }
        },
        'leaves'
      )
      .name('렌더링되는 잎')
      .listen()
      .disable();
    R(litter, l, 'hover', 0, 0.2, 0.002, '바닥 위 띄움 (m)');
    R(litter, l, 'rustle', 0, 1, 0.01, '바람 떨림 (rad)');
    // Keep `gone by` inside half the window, or the edge of the field itself
    // comes into view.
    R(litter, l, 'fadeStart', 2, 80, 0.5, '이 거리부터 옅어짐 (m)');
    R(litter, l, 'fadeEnd', 3, 100, 0.5, '이 거리에서 사라짐 (m)');

    // What a foot does to them. `push speed` is the dead band that stops the
    // leaves under a standing character boiling; `forward blend` is what turns
    // the throw from an explosion underneath you into a sweep.
    const push = litter.addFolder('발밑 효과');
    R(push, l, 'pushRadius', 0.1, 3, 0.05, '쓸기 반경 (m)');
    R(push, l, 'pushLead', -1, 2, 0.05, '몸 앞 쓸기 (m)');
    R(push, l, 'pushForce', 0, 3, 0.01, '힘');
    R(push, l, 'pushLift', 0, 2, 0.01, '띄움');
    R(push, l, 'pushForward', 0, 1, 0.01, '전방 섞임');
    R(push, l, 'pushSpeed', 0, 3, 0.05, '최소 이동 속도 (m/s)');
    R(push, l, 'pushBudget', 1, 200, 1, '프레임당 잎 수 (한도)');

    // And what the wind does: a few a second come unstuck and skitter downwind.
    const skitter = litter.addFolder('바람에 날림');
    R(skitter, l, 'gustRate', 0, 60, 0.5, '초당 띄움 개수');
    R(skitter, l, 'gustForce', 0, 3, 0.01, '힘');
    R(skitter, l, 'gustLift', 0, 2, 0.01, '띄움');
    R(skitter, l, 'gustSpread', 0, 3.2, 0.05, '퍼짐 각도 (rad)');

    // The flight itself. The swirl and the spin both die out exactly as the leaf
    // lands, which is what makes the landing place computable — and that is what
    // lets a leaf be kicked again from where it came down.
    const flight = litter.addFolder('비행');
    R(flight, l, 'flight', 0.1, 5, 0.05, '비행 시간 (초)');
    R(flight, l, 'drag', 0.1, 8, 0.05, '공기 저항');
    R(flight, l, 'swirl', 0, 1.5, 0.01, '소용돌이 (m)');
    R(flight, l, 'swirlSpeed', 0, 20, 0.1, '소용돌이 속도');
    R(flight, l, 'spin', 0, 60, 0.5, '회전 (rad/s)');

    /* ---- the air ---- */
    const d = g.drift;
    const drift = folder.addFolder('표류 (공중)');
    drift.add(d, 'enabled').name('표류 켜기');
    R(drift, d, 'count', 0, 1024, 1, '잎 개수 (비용)');
    R(drift, d, 'radius', 2, 90, 0.5, '생성 반경 (m)');
    R(drift, d, 'life', 2, 60, 0.5, '수명 (초)');
    R(drift, d, 'lifeVariance', 0, 0.9, 0.01, '수명 편차');
    R(drift, d, 'heightMin', 0, 20, 0.1, '태어나는 높이 (m)');
    R(drift, d, 'heightMax', 0, 40, 0.1, '최대 높이 (m)');
    R(drift, d, 'sizeScale', 0.1, 4, 0.05, '낙엽 대비 크기');

    // The glide. A leaf is a wing: it does not drop, it swings across its own
    // fall, and this pair is most of why these read as leaves.
    const fall = drift.addFolder('낙하 & 휘날림');
    R(fall, d, 'fall', 0, 4, 0.01, '침하 속도 (m/s)');
    R(fall, d, 'flutter', 0, 3, 0.01, '휘날림 폭 (m)');
    R(fall, d, 'flutterSpeed', 0, 8, 0.05, '휘날림 속도');
    R(fall, d, 'tumble', 0, 4, 0.01, '뒤집힘');
    R(fall, d, 'yawDrift', 0, 3, 0.01, '요 드리프트 (rad/s)');
    // What makes one land instead of stopping dead on its edge.
    R(fall, d, 'settle', 0.05, 5, 0.05, '이 높이에서 평평해짐 (m)');
    R(fall, d, 'hover', 0, 0.3, 0.005, '바닥 위 안착 거리 (m)');

    const seen = drift.addFolder('페이드');
    R(seen, d, 'fadeIn', 0.005, 0.5, 0.005, '나타남 (수명 대비)');
    R(seen, d, 'fadeOut', 0.005, 0.6, 0.005, '사라짐 (수명 대비)');
    R(seen, d, 'fadeStart', 2, 90, 0.5, '이 거리부터 옅어짐 (m)');
    R(seen, d, 'fadeEnd', 3, 120, 0.5, '이 거리에서 사라짐 (m)');
    // Nothing else can fix a leaf sitting on the lens.
    R(seen, d, 'nearFade', 0, 6, 0.05, '카메라로부터 비움 (m)');
    R(seen, d, 'nearFadeRange', 0.05, 6, 0.05, '비움 구간 (m)');
  }

  /**
   * Ascendance — the light, and the ten seconds it leaves behind.
   *
   * Five layers, one folder each, because that is how the effect is built and
   * dialling one of them means turning the other four off in your head first.
   *
   * The three worth reaching for before any of the rest are `duration` (how
   * long the boon is up), `haste` and `might` (what it is actually worth), and
   * `pillar -> height`, the number that decides whether the shaft came out of
   * the sky or out of a lamp just above the frame. "Call it down" fires the
   * whole thing on the spot, which is the only sane way to tune a move whose
   * first second is an intro.
   */
  _buildAscendance() {
    const folder = this.gui.addFolder('승천 (빛)');
    const a = settings.ascendance;
    const R = Editor.range;

    folder
      .add({ cast: () => this.hooks.onCastAscendance?.() }, 'cast')
      .name('빛을 불러내기 (자신에게)');
    folder.add(a, 'enabled').name('켜기');
    R(folder, a, 'duration', 1, 60, 0.5, '가호 지속 시간 (초)');
    R(folder, a, 'warn', 0, 6, 0.1, '종료 N초 전 경고 (초)');
    R(folder, a, 'haste', 1, 3, 0.01, '이동 배율');
    R(folder, a, 'might', 1, 4, 0.01, '타격 배율');
    R(folder, a, 'shake', 0, 1.5, 0.01, '도착 시 흔들림 (m)');

    // The choreography. `duration` is not one of these — it is the beat
    // between `descend` and `fade`.
    const beats = folder.addFolder('비트 (초)');
    const b = a.beats;
    R(beats, b, 'gather', 0.05, 3, 0.01, '원 그려짐');
    R(beats, b, 'descend', 0.05, 2, 0.01, '빛 기둥 내려옴');
    R(beats, b, 'settle', 0.05, 3, 0.01, '구멍 닫힘');
    R(beats, b, 'fade', 0.1, 3, 0.01, '다시 올라감');

    // Layer 1. The same shader the fist's seal is drawn with, bound to the
    // height field so this one lies on the ground instead of hanging over it.
    const sigil = folder.addFolder('1 - 인장');
    const g = a.sigil;
    R(sigil, g, 'radius', 0.5, 6, 0.05, '반경 (m)');
    R(sigil, g, 'lift', 0, 0.4, 0.005, '바닥에서 띄움 (m)');
    sigil.addColor(g, 'color').name('선 색상');
    sigil.addColor(g, 'coreColor').name('핵심 색상');
    R(sigil, g, 'intensity', 0, 8, 0.05, '밝기');
    R(sigil, g, 'spin', -2, 2, 0.01, '초당 회전');
    R(sigil, g, 'ticks', 4, 120, 1, '눈금');
    R(sigil, g, 'runes', 3, 40, 1, '룬');
    R(sigil, g, 'spokes', 2, 24, 1, '살');
    R(sigil, g, 'width', 0.002, 0.06, 0.001, '선 굵기');
    R(sigil, g, 'softness', 0.001, 0.06, 0.001, '페더');
    R(sigil, g, 'haze', 0, 2, 0.01, '내부 빛');
    R(sigil, g, 'detail', 0, 1, 0.01, '얼룩');
    R(sigil, g, 'pulse', 0, 1, 0.01, '호흡 깊이');
    R(sigil, g, 'pulseSpeed', 0, 20, 0.1, '호흡 속도');

    // Layer 2. `corePower` is the one to reach for: it is the profile the eye's
    // ray takes through the column, and it is the difference between a disc of
    // light and a filament with air around it.
    const pillar = folder.addFolder('2 - 빛 기둥');
    const p = a.pillar;
    R(pillar, p, 'radius', 0.1, 4, 0.01, '구멍 직경 (m)');
    R(pillar, p, 'height', 4, 80, 0.5, '최대 높이 (m)');
    pillar.addColor(p, 'color').name('기둥 색상');
    pillar.addColor(p, 'coreColor').name('핵심 색상');
    R(pillar, p, 'intensity', 0, 6, 0.01, '밝기');
    R(pillar, p, 'corePower', 0.2, 8, 0.05, '핵심 집중도');
    R(pillar, p, 'rimPower', 0.2, 10, 0.05, '림 집중도');
    R(pillar, p, 'rim', 0, 3, 0.01, '림 강도');
    R(pillar, p, 'topFade', 0.02, 0.95, 0.01, '이만큼 흐려짐 (비율)');
    R(pillar, p, 'streaks', 0, 2, 0.01, '낙하 빛');
    R(pillar, p, 'streakScale', 0.1, 8, 0.05, '줄무늬 크기');
    R(pillar, p, 'streakSpeed', 0, 8, 0.05, '줄무늬 속도');
    R(pillar, p, 'pulse', 0, 1, 0.01, '호흡 깊이');
    R(pillar, p, 'pulseSpeed', 0, 12, 0.05, '호흡 속도');
    R(pillar, p, 'flare', 1, 4, 0.01, '발끝 확장 배율');
    R(pillar, p, 'flareHeight', 0.005, 0.4, 0.005, '확장 도달 비율');
    R(pillar, p, 'gatherHead', 0, 0.95, 0.01, '모으기 종료 시점 도달 비율');
    R(pillar, p, 'arrivalWidth', 0, 3, 0.01, '도착 시 추가 직경');
    R(pillar, p, 'flashTime', 0.05, 2, 0.01, '도착 섬광 (초)');

    // Layer 3. One draw call however many there are, so `count` is very nearly
    // free — the buffer is built for 24.
    const ribbons = folder.addFolder('3 - 리본');
    const r = a.ribbons;
    R(ribbons, r, 'count', 0, 24, 1, '개수');
    ribbons.addColor(r, 'color').name('리본 색상');
    ribbons.addColor(r, 'coreColor').name('핵심 색상');
    R(ribbons, r, 'intensity', 0, 6, 0.01, '밝기');
    R(ribbons, r, 'radius', 0.1, 4, 0.01, '떠나는 반경 (m)');
    R(ribbons, r, 'height', 0.5, 12, 0.05, '올라가는 높이 (m)');
    R(ribbons, r, 'turns', 0.1, 6, 0.05, '회전수 (당 올라감)');
    R(ribbons, r, 'span', 0.05, 1, 0.01, '길이 (상승 대비)');
    R(ribbons, r, 'speed', 0, 2, 0.01, '초당 회전');
    R(ribbons, r, 'swirl', -3, 3, 0.01, '초당 추가 회전');
    R(ribbons, r, 'width', 0.005, 0.5, 0.005, '너비 (m)');
    R(ribbons, r, 'topScale', 0.05, 1.5, 0.01, '꼭대기 좁아짐 배율');
    R(ribbons, r, 'waist', 0, 0.6, 0.01, '허리 깊이');
    R(ribbons, r, 'softness', 0.2, 6, 0.05, '가장자리 감쇠');
    R(ribbons, r, 'corePower', 1, 16, 0.1, '핵심 집중도');

    // Layer 4. One frame of white on the floor — the petals are the read, and
    // the core is what makes the first two frames a hole rather than a fan.
    const burst = folder.addFolder('4 - 폭발');
    const bu = a.burst;
    R(burst, bu, 'radius', 0.5, 12, 0.1, '도달 (m)');
    R(burst, bu, 'life', 0.1, 3, 0.01, '지속 (초)');
    burst.addColor(bu, 'color').name('파동 색상');
    burst.addColor(bu, 'coreColor').name('핵심 색상');
    R(burst, bu, 'intensity', 0, 8, 0.05, '밝기');
    R(burst, bu, 'petals', 1, 48, 1, '꽃잎');
    R(burst, bu, 'petalWidth', 0.005, 0.4, 0.005, '꽃잎 너비');
    R(burst, bu, 'petalLength', 0.1, 1, 0.01, '꽃잎 길이');
    R(burst, bu, 'ringWidth', 0.005, 0.3, 0.005, '선단 너비');
    R(burst, bu, 'softness', 0.005, 0.5, 0.005, '페더');
    R(burst, bu, 'core', 0, 6, 0.05, '중심 섬광');
    R(burst, bu, 'lift', 0, 0.3, 0.005, '바닥에서 띄움 (m)');

    // Layer 5. The only loose thing in the ability, and the reason the other
    // four read as one event rather than as four decals in the same place.
    const embers = folder.addFolder('5 - 불씨');
    const e = a.embers;
    embers.addColor(e, 'color').name('입자 색상');
    embers.addColor(e, 'coreColor').name('핵심 색상');
    R(embers, e, 'intensity', 0, 6, 0.05, '밝기');
    R(embers, e, 'rate', 0, 120, 1, '유지 중 초당');
    R(embers, e, 'gatherRate', 0, 60, 1, '모으는 중 초당');
    R(embers, e, 'burst', 0, 300, 1, '도착 시');
    R(embers, e, 'spread', 0.1, 2, 0.01, '태어남 위치 (인장 대비)');
    R(embers, e, 'life', 0.2, 8, 0.05, '하나의 수명 (초)');
    R(embers, e, 'speed', 0, 6, 0.05, '떠나는 속도 (m/s)');
    R(embers, e, 'spawnHeight', 0, 4, 0.05, '최대 발생 높이 (m)');
    R(embers, e, 'drag', 0.05, 6, 0.05, '공기 저항');
    R(embers, e, 'rise', 0, 8, 0.05, '끌어올림 가속도 (m/s²)');
    R(embers, e, 'size', 0.005, 0.4, 0.005, '크기 (m)');
    R(embers, e, 'grow', 0, 3, 0.01, '성장 배율');
    R(embers, e, 'sway', 0, 2, 0.01, '떠돌이 (m)');
    R(embers, e, 'swaySpeed', 0, 6, 0.05, '떠돌이 속도');
    R(embers, e, 'halo', 0, 2, 0.01, '광배');
    R(embers, e, 'sharpness', 0.01, 0.6, 0.005, '가장자리 강도');
    R(embers, e, 'twinkle', 0, 1, 0.01, '반짝임');
    R(embers, e, 'spin', 0, 12, 0.05, '회전 속도 (rad/s)');

    // The one part of it that lights anything at all.
    const light = folder.addFolder('빛 자체');
    const l = a.light;
    light.addColor(l, 'color').name('색상');
    R(light, l, 'intensity', 0, 40, 0.1, '유지 중');
    R(light, l, 'flash', 0, 120, 0.5, '도착 시');
    R(light, l, 'height', 0, 1.5, 0.01, '위치 (몸 높이 대비)');
    R(light, l, 'distance', 1, 40, 0.5, '도달 (m)');
    R(light, l, 'decay', 0.5, 4, 0.05, '감쇠');
  }

  /**
   * Shadow Boost — the dark, and the seconds it leaves behind.
   *
   * Five layers again, one folder each, and laid out in the order they are
   * drawn rather than the order they are noticed: the pool is at the bottom of
   * the stack and is doing more for the read than anything above it.
   *
   * Three to reach for before the rest. `might` is what the ability is *worth*
   * (it is the heavier of the two boons and the slower). `swirl -> stretch` is
   * the single number that decides whether the shadow going round the body is a
   * *spiral* or a cloud of blobs — it is how far each puff is drawn out along
   * its own orbit, and at 1 the layer stops working. And `column -> shade`,
   * which darkens the shaft's **edges** (not its middle — see
   * `vfx/DarkPillar.js`): it is what gives the column an outside, and it is the
   * slider to reach for if the shaft looks like a neon tube.
   */
  _buildShadowBoost() {
    const folder = this.gui.addFolder('그림자 강화 (어둠)');
    const s = settings.shadowBoost;
    const R = Editor.range;

    folder
      .add({ cast: () => this.hooks.onCastShadowBoost?.() }, 'cast')
      .name('어둠을 불러내기 (발밑)');
    folder.add(s, 'enabled').name('켜기');
    R(folder, s, 'duration', 1, 60, 0.5, '가호 지속 시간 (초)');
    R(folder, s, 'warn', 0, 6, 0.1, '종료 N초 전 경고 (초)');
    R(folder, s, 'haste', 1, 3, 0.01, '이동 배율');
    R(folder, s, 'might', 1, 4, 0.01, '타격 배율');
    R(folder, s, 'shake', 0, 1.5, 0.01, '도착 시 흔들림 (m)');

    // The choreography. `duration` is not one of these — it is the beat between
    // `erupt` and `fade`.
    const beats = folder.addFolder('비트 (초)');
    const b = s.beats;
    R(beats, b, 'gather', 0.05, 3, 0.01, 'the pool opens');
    R(beats, b, 'erupt', 0.05, 2, 0.01, 'the column comes up');
    R(beats, b, 'settle', 0.05, 3, 0.01, '구멍 닫힘');
    R(beats, b, 'fade', 0.1, 3, 0.01, 'drawn back down');

    // Layer 1. No shape at all, and the thing every other layer is seen
    // against — `falloff` is the whole control: low is a wash, high is a bloom.
    const glow = folder.addFolder('1 - 기본 발광');
    const g = s.glow;
    R(glow, g, 'radius', 0.5, 8, 0.05, '반경 (m)');
    R(glow, g, 'lift', 0, 0.4, 0.005, '바닥에서 띄움 (m)');
    glow.addColor(g, 'color').name('퍼짐 색상');
    glow.addColor(g, 'coreColor').name('핵심 색상');
    R(glow, g, 'intensity', 0, 6, 0.05, '밝기');
    R(glow, g, 'falloff', 0.2, 8, 0.05, '퍼짐 감쇠');
    R(glow, g, 'core', 0.02, 1, 0.01, '중앙 뜨거운 부분 (비율)');
    R(glow, g, 'corePower', 0.2, 8, 0.05, '핵심 집중도');
    R(glow, g, 'pulse', 0, 1, 0.01, '호흡 깊이');
    R(glow, g, 'pulseSpeed', 0, 12, 0.05, '호흡 속도');
    R(glow, g, 'mottle', 0, 1, 0.01, '얼룩');
    R(glow, g, 'mottleScale', 0.2, 8, 0.05, '얼룩 크기');
    R(glow, g, 'mottleSpeed', 0, 2, 0.01, '얼룩 흐름');

    // Layer 2. `trough` is the one that matters: it is the shadow behind each
    // front, and it is what stands a drawn circle up off the floor.
    const rings = folder.addFolder('2 - 지면 왜곡');
    const r = s.rings;
    R(rings, r, 'radius', 0.5, 12, 0.05, '도달 (m)');
    R(rings, r, 'lift', 0, 0.4, 0.005, '바닥에서 띄움 (m)');
    rings.addColor(r, 'color').name('선단 색상');
    rings.addColor(r, 'coreColor').name('핵심 색상');
    R(rings, r, 'intensity', 0, 6, 0.05, '밝기');
    R(rings, r, 'rings', 1, 12, 1, '동시 선단 수');
    R(rings, r, 'speed', -3, 3, 0.01, '초당 선단');
    R(rings, r, 'width', 0.002, 0.2, 0.002, '선단 너비');
    R(rings, r, 'softness', 0.002, 0.1, 0.002, '페더');
    R(rings, r, 'glow', 0, 2, 0.01, '선 광채');
    R(rings, r, 'glowWidth', 0.005, 0.6, 0.005, '광채 도달');
    R(rings, r, 'trough', 0, 2, 0.01, '골 깊이');
    R(rings, r, 'troughWidth', 0.005, 0.4, 0.005, '골 도달');
    R(rings, r, 'warp', 0, 0.4, 0.005, '왜곡 (비율)');
    R(rings, r, 'warpScale', 0.2, 10, 0.05, '왜곡 크기');
    R(rings, r, 'warpSpeed', 0, 3, 0.01, '왜곡 흐름');
    R(rings, r, 'spin', -2, 2, 0.01, '초당 회전');

    // Layer 3. Two tubes on one geometry — see `vfx/DarkPillar.js`. `shade` is
    // the dark half and `rim` is the bright one, and the balance between them
    // is the entire look of the column.
    const column = folder.addFolder('3 - 어두운 기둥');
    const c = s.column;
    R(column, c, 'radius', 0.1, 4, 0.01, '구멍 직경 (m)');
    R(column, c, 'height', 2, 40, 0.5, '최대 높이 (m)');
    column.addColor(c, 'color').name('에너지 색상');
    column.addColor(c, 'coreColor').name('핵심 색상');
    column.addColor(c, 'shadeColor').name('그림자 색상');
    R(column, c, 'intensity', 0, 4, 0.01, '밝기');
    R(column, c, 'shade', 0, 1, 0.01, '가장자리 어두워짐');
    R(column, c, 'shadePower', 0.2, 8, 0.05, '어두운 가장자리 집중도');
    R(column, c, 'corePower', 0.2, 8, 0.05, '핵심 집중도');
    R(column, c, 'rimPower', 0.2, 10, 0.05, '림 집중도');
    R(column, c, 'rim', 0, 3, 0.01, '림 강조');
    R(column, c, 'topFade', 0.02, 0.95, 0.01, '이만큼 흐려짐 (비율)');
    R(column, c, 'streaks', 0, 2, 0.01, '낙하 빛');
    R(column, c, 'streakScale', 0.1, 8, 0.05, '줄무늬 크기');
    R(column, c, 'streakSpeed', 0, 8, 0.05, '줄무늬 속도');
    R(column, c, 'veins', 0, 3, 0.01, '번개');
    R(column, c, 'veinScale', 0.2, 10, 0.05, '번개 크기');
    R(column, c, 'veinRate', 0.5, 20, 0.1, '초당 발생');
    R(column, c, 'veinPower', 1, 20, 0.1, '번개 가늘기');
    R(column, c, 'veinBranch', 0, 1, 0.01, '분기');
    R(column, c, 'front', 0, 1, 0.01, '가까운 벽 강도 배율');
    R(column, c, 'pulse', 0, 1, 0.01, '호흡 깊이');
    R(column, c, 'pulseSpeed', 0, 12, 0.05, '호흡 속도');
    R(column, c, 'flare', 1, 4, 0.01, '발끝 확장 배율');
    R(column, c, 'flareHeight', 0.005, 0.4, 0.005, '확장 도달 비율');
    R(column, c, 'arrivalWidth', 0, 3, 0.01, '도착 시 추가 직경');
    R(column, c, 'flashTime', 0.05, 2, 0.01, '도착 섬광 (초)');

    // Layer 4. One draw call however many there are, so `count` is very nearly
    // free — the buffer is built for 24.
    const wisps = folder.addFolder('4 - 솟아오르는 연기');
    const w = s.wisps;
    R(wisps, w, 'count', 0, 24, 1, '개수');
    wisps.addColor(w, 'color').name('연기 색상');
    wisps.addColor(w, 'rimColor').name('프린지 색상');
    R(wisps, w, 'opacity', 0, 1, 0.01, '불투명도');
    R(wisps, w, 'rim', 0, 2, 0.01, '프린지 강도');
    R(wisps, w, 'radius', 0.1, 4, 0.01, '떠나는 반경 (m)');
    R(wisps, w, 'height', 0.5, 12, 0.05, '올라가는 높이 (m)');
    R(wisps, w, 'curl', 0, 3, 0.01, '회전수 (당 올라감)');
    R(wisps, w, 'writhe', -3, 3, 0.01, '초당 추가 회전');
    R(wisps, w, 'sway', 0, 2, 0.01, '떠돌이 (m)');
    R(wisps, w, 'span', 0.05, 1, 0.01, '길이 (상승 대비)');
    R(wisps, w, 'speed', 0, 2, 0.01, '초당 회전');
    R(wisps, w, 'width', 0.01, 1.5, 0.01, '발끝 너비 (m)');
    R(wisps, w, 'spread', 0.2, 4, 0.01, '확장 배율');
    R(wisps, w, 'topScale', 0.2, 3, 0.01, '확장 배율');
    R(wisps, w, 'softness', 0.2, 6, 0.05, '가장자리 감쇠');
    R(wisps, w, 'detail', 0.2, 10, 0.05, '찢김 크기');
    R(wisps, w, 'churn', 0, 3, 0.01, '찢김 흐름');
    R(wisps, w, 'erode', 0, 1.5, 0.01, '잠식 강도');

    // Layer 5. The fast layer, against the wisps' slow one. `spin` first.
    const swirl = folder.addFolder('5 - 소용돌이치는 그림자');
    const sw = s.swirl;
    swirl.addColor(sw, 'color').name('연기 색상');
    swirl.addColor(sw, 'rimColor').name('프린지 색상');
    R(swirl, sw, 'opacity', 0, 1, 0.01, '불투명도');
    R(swirl, sw, 'rim', 0, 2, 0.01, '프린지 강도');
    R(swirl, sw, 'rate', 0, 120, 1, '유지 중 초당');
    R(swirl, sw, 'gatherRate', 0, 60, 1, '모으는 중 초당');
    R(swirl, sw, 'burst', 0, 300, 1, '도착 시');
    R(swirl, sw, 'spread', 0.1, 2, 0.01, 'born within (frac of pool)');
    R(swirl, sw, 'life', 0.2, 8, 0.05, '하나의 수명 (초)');
    R(swirl, sw, 'spin', -8, 8, 0.05, '회전 속도 (rad/s)');
    swirl.add(sw, 'reverse').name('반대 방향으로 회전');
    R(swirl, sw, 'widen', -1, 2, 0.01, '궤도 확장');
    R(swirl, sw, 'rise', -2, 6, 0.05, '상승 속도 (m/s)');
    R(swirl, sw, 'spawnHeight', 0, 4, 0.05, '최대 발생 높이 (m)');
    R(swirl, sw, 'size', 0.02, 2, 0.01, '크기 (m)');
    R(swirl, sw, 'grow', 0, 3, 0.01, '성장 배율');
    R(swirl, sw, 'stretch', 1, 8, 0.05, '궤도 따라 늘어남 배율');
    R(swirl, sw, 'wobble', 0, 2, 0.01, '떠돌이 (m)');
    R(swirl, sw, 'wobbleSpeed', 0, 6, 0.05, '떠돌이 속도');
    R(swirl, sw, 'detail', 0.2, 6, 0.05, '찢김 크기');
    R(swirl, sw, 'churn', 0, 3, 0.01, '찢김 흐름');
    R(swirl, sw, 'softness', 0.01, 0.8, 0.01, '내부 페더');
    R(swirl, sw, 'erode', 0, 1.5, 0.01, '잠식 강도');

    // And the one part of it that lights anything at all — which a dark aura
    // needs more than a bright one does, not less.
    const light = folder.addFolder('빛 자체');
    const l = s.light;
    light.addColor(l, 'color').name('색상');
    R(light, l, 'intensity', 0, 40, 0.1, '유지 중');
    R(light, l, 'flash', 0, 120, 0.5, '도착 시');
    R(light, l, 'height', 0, 1.5, 0.01, '위치 (몸 높이 대비)');
    R(light, l, 'distance', 1, 40, 0.5, '도달 (m)');
    R(light, l, 'decay', 0.5, 4, 0.05, '감쇠');
  }

  _buildPost() {
    const folder = this.gui.addFolder('후처리');
    const p = settings.post;
    const R = Editor.range;

    folder.add(p, 'enabled').name('켜기');
    // The only anti-aliasing in the project — the scene never touches the canvas
    // directly, so the renderer's own flag has nothing to act on. It is also the
    // heaviest thing in the stack, hence a dial rather than a constant.
    folder.add(p, 'samples', [0, 2, 4, 8]).name('안티에일리어싱');
    R(folder, p, 'exposure', 0.1, 3, 0.01, '노출');
    R(folder, p, 'bloomStrength', 0, 3, 0.01, '블룸 강도');
    R(folder, p, 'bloomRadius', 0, 1.5, 0.01, '블룸 반경');
    R(folder, p, 'bloomThreshold', 0, 2, 0.01, '블룸 임계값');
    R(folder, p, 'contrast', 0.5, 2, 0.01, '대비');
    R(folder, p, 'saturation', 0, 2.5, 0.01, '채도');
    R(folder, p, 'temperature', -0.5, 0.5, 0.01, '색온도');
    R(folder, p, 'lift', -0.2, 0.2, 0.005, '띄움');
    R(folder, p, 'gain', 0.5, 2, 0.01, '게인');
    R(folder, p, 'vignette', 0, 1.5, 0.01, '비네트');
    R(folder, p, 'chromaticAberration', 0, 3, 0.01, '색수차');
    R(folder, p, 'grain', 0, 0.2, 0.001, '필름 그레인');
  }

  _buildCamera() {
    const folder = this.gui.addFolder('카메라');
    const c = settings.camera;
    const R = Editor.range;

    // The wheel writes `distance` straight into settings, so the slider listens.
    R(folder, c, 'distance', 1, 40, 0.1, '거리').listen();
    R(folder, c, 'minDistance', 1, 20, 0.1, '최소 거리');
    R(folder, c, 'maxDistance', 4, 40, 0.1, '최대 거리');
    R(folder, c, 'zoomSpeed', 0.1, 3, 0.01, '줌 속도');
    R(folder, c, 'fov', 20, 90, 0.5, '시야각');
    R(folder, c, 'targetHeight', 0, 4, 0.01, '타깃 높이');
    R(folder, c, 'minPolar', 0.05, 1.5, 0.01, '최소 피치');
    // Past π/2 the camera drops below its target and the view tilts up, which is
    // the only way anything in the sky gets into frame. Nothing collides the
    // lens against the floor, so a long zoom at the top of this range will go
    // through the ground — which is why the default stops just past level.
    R(folder, c, 'maxPolar', 0.2, 2.2, 0.01, '최대 피치');
    R(folder, c, 'damping', 0.001, 0.5, 0.001, '따라가기 댐핑');
    // The captured pointer's turn rate, for every weapon and none — the sights
    // only multiply it (see the gunplay folder).
    R(folder, c, 'sensitivity', 0.0004, 0.008, 0.0001, '마우스 (rad/px)');
  }

  _buildCharacter() {
    const folder = this.gui.addFolder('캐릭터');
    const c = settings.character;
    const R = Editor.range;

    // The mixer's own rate.
    R(folder, settings.global, 'animationSpeed', 0.1, 3, 0.01, '재생 속도');
    R(folder, settings.global, 'timeScale', 0.02, 2, 0.01, '시간 배율');

    // The turntable advances `facing` itself, so that slider listens.
    R(folder, c, 'spin', -0.5, 0.5, 0.005, '회전 속도 (rev/s)');
    R(folder, c, 'facing', -Math.PI, Math.PI * 3, 0.01, '방향').listen();

    // The skin's response to the stage's lights. The body wears the glTF
    // palette's authored maps, so these two only reach it once the override is
    // on — off, they still drive any material the palette had no match for.
    const material = folder.addFolder('피부');
    material.add(c, 'overrideSurface').name('원본 PBR 덮어쓰기');
    R(material, c, 'roughness', 0, 1, 0.01, '거칠기');
    R(material, c, 'metalness', 0, 1, 0.01, '금속성');

    // The rig is re-normalised against `targetHeight` every frame, so this
    // rescales the body live — and anything attached to a bone with it.
    const rig = folder.addFolder('리깅');
    R(rig, c, 'targetHeight', 1, 3, 0.01, '높이 (m)');
    R(rig, c, 'turnRate', 0.000001, 0.02, 0.000001, '회전 따라가기');
  }

  _buildLocomotion() {
    const folder = this.gui.addFolder('이동 동작');
    const l = settings.locomotion;
    const R = Editor.range;

    folder.add(l, 'enabled').name('조작 켜기');

    // How fast the body travels. The stride rate divides these by the clip
    // speeds below, so raising one speeds the legs up to match.
    R(folder, l, 'walkSpeed', 0.2, 4, 0.01, '걷기 (m/s)');
    R(folder, l, 'runSpeed', 1, 12, 0.01, '달리기 (m/s)');
    R(folder, l, 'acceleration', 1, 60, 0.1, '가속');
    R(folder, l, 'deceleration', 1, 60, 0.1, '감속');
    R(folder, l, 'blendRate', 0.000001, 0.05, 0.000001, '블렌드 따라가기');
    // The cross-fade between the two idles — the plain stand and the rifle one.
    // Faster than the gait blend: it is answering a weapon appearing in the
    // hand and has to be done by the time the burn is (see `Weapons` below).
    R(folder, l, 'stanceRate', 0.0000001, 0.01, 0.0000001, '자세 블렌드');

    const gait = folder.addFolder('보행');
    R(gait, l, 'idleThreshold', 0, 0.5, 0.001, '이 속도 미만 대기 (m/s)');
    // The speeds the clips themselves cover at rate 1 — the divisor. Tune these
    // once against the animation; move `walkSpeed`/`runSpeed` for design.
    R(gait, l, 'clipWalkSpeed', 0.2, 4, 0.01, '걷기 클립 속도 (m/s)');
    R(gait, l, 'clipRunSpeed', 1, 12, 0.01, '달리기 클립 속도 (m/s)');
    // Trim on top of that division, per gait — for the part of the mismatch the
    // clip speeds do not account for. Blended between the two by the same curve
    // the weights use, and bounded by the stride clamp below.
    R(gait, l, 'walkAnimSpeed', 0.25, 3, 0.01, '걷기 애니메이션 배율');
    R(gait, l, 'runAnimSpeed', 0.25, 3, 0.01, '달리기 애니메이션 배율');
    R(gait, l, 'strideMin', 0.2, 1, 0.01, '보폭 최소');
    R(gait, l, 'strideMax', 1, 5, 0.01, '보폭 최대');

    // Space, from a run. `distance` renormalises the clip's own travel, so it is
    // the reach of the jump in metres — 0 hands it back to the animation.
    const jump = folder.addFolder('멀리 점프');
    const j = settings.jump;
    jump.add(j, 'enabled').name('멀리 점프 켜기');
    R(jump, j, 'distance', 0, 20, 0.1, '거리 (m)');
    R(jump, j, 'minRunFraction', 0, 1, 0.01, '달리기 배율 이상에서 발진');
    R(jump, j, 'landAt', 0.4, 1, 0.01, '조작 복귀 시점');
    R(jump, j, 'blendIn', 0.01, 0.6, 0.01, '블렌드 인 (초)');
    R(jump, j, 'blendOut', 0.01, 0.8, 0.01, '블렌드 아웃 (초)');

    // Space at anything less. It covers no ground of its own, so what there is
    // to tune is how it sits over the gait: `gaitBleed` is how much of the walk
    // or run keeps playing under it, which is what keeps the legs carrying the
    // body instead of planting while the controller travels.
    const hop = folder.addFolder('짧은 점프');
    const h = settings.hop;
    hop.add(h, 'enabled').name('짧은 점프 켜기');
    R(hop, h, 'gaitBleed', 0, 1, 0.01, '점프 중 보행 유지');
    R(hop, h, 'landAt', 0.4, 1, 0.01, '발이 닿는 시점');
    R(hop, h, 'blendIn', 0.01, 0.6, 0.01, '블렌드 인 (초)');
    R(hop, h, 'blendOut', 0.01, 0.8, 0.01, '블렌드 아웃 (초)');
  }

  /**
   * The kick and the bodies it lands on.
   *
   * Two halves that meet in one place. The **kick** half is the animation
   * contract: `hitAt`, `recoverAt` and `approach` are normalised times in the
   * clip, and they are the three numbers to reach for after watching the move
   * once — the foot connects here, control comes back there, and the warp has
   * that long to put the body where the animator assumed it was standing.
   *
   * The **enemies** half is the sandbox around it. Everything is live except
   * the height and the ring, which are read when a body is spawned — hit
   * "Respawn all" after moving those.
   */
  /**
   * The swap between the katana and the rifle — see `equipment/WeaponSwitch.js`.
   *
   * All of it is the *look* of one exchange: how long it takes, how much its
   * two halves overlap, and what the mask that eats each weapon looks like
   * while it does. Nothing here decides which weapon is out — that is `1`, the
   * chip along the bottom, or the Weapon buttons on the character screen.
   */
  _buildWeapons() {
    const folder = this.gui.addFolder('무기 (교체)');
    const w = settings.weapons;
    const R = Editor.range;

    R(folder, w, 'switchTime', 0.1, 2.5, 0.01, '교체 시간 (초)');
    // 0 empties the hand between the two; past about half and both are simply
    // on screen together. A quarter reads as one becoming the other.
    R(folder, w, 'overlap', 0, 0.9, 0.01, '두 단계 겹침');
    // Where in that the body's grip changes — it belongs to the weapon
    // arriving, not to either end of the swap.
    R(folder, w, 'handover', 0, 1, 0.01, '손잡이 변경 시점');

    const mask = folder.addFolder('마스크');
    mask.addColor(w, 'edgeColor').name('가장자리 색상');
    R(mask, w, 'edgeEmissive', 0, 24, 0.1, '가장자리 발광');
    R(mask, w, 'edgeWidth', 0.01, 0.6, 0.005, '가장자리 너비');
    // Features per metre. Weapons are small, so this runs far higher than the
    // same control on a body.
    R(mask, w, 'detail', 2, 120, 0.5, '노이즈 디테일');
    // 1 is a clean line travelling the length of the piece; 0 is static eating
    // it from everywhere at once.
    R(mask, w, 'rise', 0, 1, 0.01, '오브젝트 따라 타오름');
  }

  /**
   * The shooter, in the order the numbers are actually reached for.
   *
   * The lens first, because where the camera stands is the whole mode; then the
   * body, because a torso that will not come round far enough is the next thing
   * anyone notices; then the gun; then what it costs to be hit. The look — the
   * tracer, the flash, the sparks — is last, on the grounds that nobody tunes a
   * muzzle flash before they have decided how the gun handles.
   */
  _buildGunplay() {
    const folder = this.gui.addFolder('총격 (소총)');
    const g = settings.gunplay;
    const R = Editor.range;

    folder.add(g, 'enabled').name('켜기');
    // The key and the middle mouse button both write this, so it listens.
    folder.add(g, 'shoulder', { Left: -1, Right: 1 }).name('어깨').listen();

    const lens = folder.addFolder('렌즈');
    const c = g.camera;
    // The number the whole mode stands on: with it at 0 the body is in front of
    // its own aim and there is nowhere honest to put a reticle.
    R(lens, c, 'offset', 0, 1.6, 0.01, '축에서 거리 (m)');
    R(lens, c, 'rise', -0.4, 0.4, 0.01, '상승 (m)');
    R(lens, c, 'distance', 0.8, 6, 0.05, '거리 (m)');
    R(lens, c, 'targetHeight', 0.6, 2.4, 0.01, '주시 높이 (m)');
    R(lens, c, 'fov', 25, 80, 0.5, '시야각');
    R(lens, c, 'blend', 0.00001, 0.02, 0.00001, '올라오는 시간');

    const sights = lens.addFolder('조준경');
    R(sights, c, 'adsOffset', 0, 1.6, 0.01, '축에서 거리 (m)');
    R(sights, c, 'adsDistance', 0.6, 4, 0.05, '거리 (m)');
    R(sights, c, 'adsTargetHeight', 0.6, 2.4, 0.01, '주시 높이 (m)');
    R(sights, c, 'adsFov', 15, 70, 0.5, '시야각');
    R(sights, c, 'adsSensitivity', 0.2, 1.5, 0.01, '마우스 배율');

    const body = folder.addFolder('몸체');
    const a = g.aim;
    R(body, a, 'maxYaw', 10, 120, 1, '상체 회전 (도)');
    R(body, a, 'maxPitch', 10, 85, 1, '상체 피치 (도)');
    // The one that decides whether a strafe reads as a person or as a body on
    // rails: how far the hips are allowed off the lens toward the travel.
    R(body, a, 'lean', 0, 90, 1, '다리 기울기 (도)');
    R(body, a, 'rate', 0.000001, 0.005, 0.000001, '회전 따라가기');
    R(body, a, 'turnRate', 0.0000001, 0.001, 0.0000001, '방향 따라가기');
    R(body, a, 'enter', 0.00001, 0.05, 0.00001, '조준 올라오는 시간');
    R(body, a, 'range', 20, 400, 5, '조준선 도달 (m)');

    const gun = folder.addFolder('총기');
    const f = g.fire;
    R(gun, f, 'rate', 1, 20, 0.1, '초당 발사 수');
    gun.add(f, 'auto').name('연사 모드');
    R(gun, f, 'speed', 30, 400, 5, '탄속 (m/s)');
    R(gun, f, 'drop', 0, 20, 0.1, '탄도 낙하 (m/s²)');
    R(gun, f, 'spread', 0, 6, 0.01, '정지 상태 퍼짐 (도)');
    R(gun, f, 'moveSpread', 0, 10, 0.01, '이동 중 퍼짐 (도)');
    R(gun, f, 'adsSpread', 0, 3, 0.01, '조준 시 퍼짐 (도)');
    R(gun, f, 'bloom', 0, 2, 0.01, '발당 누적 (도)');
    R(gun, f, 'bloomMax', 0, 10, 0.1, '최대 누적 (도)');
    R(gun, f, 'bloomRecover', 0.5, 20, 0.1, '감소 속도 (도/s)');
    R(gun, f, 'recoilPitch', 0, 3, 0.01, '상반 반동 (도)');
    R(gun, f, 'recoilYaw', 0, 2, 0.01, '좌우 반동 (도)');
    R(gun, f, 'recoilRecover', 0.0000001, 0.001, 0.0000001, '반동 복귀');
    R(gun, f, 'shake', 0, 0.3, 0.001, '렌즈 흔들림 (m)');

    const hurt = folder.addFolder('탄환 피해량');
    const d = g.damage;
    // Three of these into a hundred is the whole design: change `body` and the
    // rifle changes from a three-round weapon to something else.
    R(hurt, d, 'health', 10, 400, 5, '몸 체력');
    R(hurt, d, 'body', 1, 200, 1, '몸 명중');
    R(hurt, d, 'head', 1, 400, 1, '머리 명중');
    R(hurt, d, 'impulse', 0, 12, 0.1, '밀침 (m/s)');
    R(hurt, d, 'lift', 0, 8, 0.1, '띄움 (m/s)');
    R(hurt, d, 'spin', 0, 5, 0.05, '접힘');
    R(hurt, d, 'headImpulse', 0, 12, 0.1, '머리 밀침 (m/s)');
    R(hurt, d, 'headLift', 0, 8, 0.1, '머리 띄움 (m/s)');
    R(hurt, d, 'headSpin', 0, 6, 0.05, '머리 접힘');
    R(hurt, d, 'flinch', 0, 1, 0.01, '섬광 지속 (초)');
    R(hurt, d, 'flinchRim', 0, 20, 0.1, '섬광 밝기');
    R(hurt, d, 'hitShake', 0, 0.2, 0.001, '명중 흔들림 (m)');
    R(hurt, d, 'killShake', 0, 0.4, 0.001, '처치 흔들림 (m)');
    R(hurt, d, 'killHitStop', 0, 0.3, 0.005, '처치 정지 (초)');
    R(hurt, d, 'killHitStopScale', 0.01, 1, 0.01, '정지 강도');
    R(hurt, d, 'bodyBlood', 0, 80, 1, '몸 피방울 수');
    R(hurt, d, 'headBlood', 0, 120, 1, '머리 피방울 수');
    R(hurt, d, 'bloodSpeed', 0.2, 12, 0.1, '피방울 속도 (m/s)');

    // The bar over a head, which exists only because the rifle spends health a
    // piece at a time — see `vfx/HealthBars.js`.
    const bars = hurt.addFolder('머리 위 게이지');
    const b = g.healthBar;
    bars.add(b, 'enabled').name('게이지 표시');
    bars.add(b, 'onlyWounded').name('피격 후에만');
    bars.addColor(b, 'color').name('남은 체력');
    bars.addColor(b, 'trackColor').name('배경');
    bars.addColor(b, 'frameColor').name('테두리');
    R(bars, b, 'width', 0.1, 1.5, 0.01, '너비 (m)');
    R(bars, b, 'height', 0.01, 0.3, 0.005, '높이 (m)');
    R(bars, b, 'lift', 0, 1.2, 0.01, '머리 위 거리 (m)');
    // What keeps a bar readable once the body is a speck.
    R(bars, b, 'minWidth', 0, 120, 1, '최소 너비 (px)');
    R(bars, b, 'range', 5, 200, 5, '표시 거리 (m)');
    R(bars, b, 'trackOpacity', 0, 1, 0.01, '배경 불투명도');
    R(bars, b, 'frameOpacity', 0, 1, 0.01, '테두리 불투명도');
    R(bars, b, 'border', 0, 0.5, 0.01, '테두리 두께');
    R(bars, b, 'fadeIn', 0.02, 1, 0.01, '나타나는 시간 (초)');
    R(bars, b, 'fadeOut', 0.02, 2, 0.01, '사라지는 시간 (초)');

    const boxes = folder.addFolder('히트박스');
    const h = g.hitbox;
    // The head is deliberately a shade larger than a head — see `Hitboxes.js`.
    R(boxes, h, 'headRadius', 0.05, 0.4, 0.005, '머리 (m)');
    R(boxes, h, 'torsoRadius', 0.1, 0.6, 0.005, '상체 (m)');
    R(boxes, h, 'legRadius', 0.05, 0.5, 0.005, '다리 (m)');

    const look = folder.addFolder('외형');
    const t = g.tracer;
    look.addColor(t, 'color').name('예광탄 색상');
    R(look, t, 'brightness', 0.2, 20, 0.1, '예광탄 발광');
    R(look, t, 'length', 0.2, 12, 0.1, '예광탄 길이 (m)');
    R(look, t, 'width', 0.005, 0.2, 0.005, '예광탄 너비 (m)');
    R(look, t, 'life', 0.2, 6, 0.1, '탄환 수명 (초)');

    const flash = look.addFolder('총구 화염');
    const m = g.muzzle;
    flash.addColor(m, 'color').name('색상');
    R(flash, m, 'size', 0.05, 1.2, 0.01, '크기 (m)');
    R(flash, m, 'life', 0.01, 0.3, 0.005, '지속 (초)');
    R(flash, m, 'light', 0, 40, 0.5, '빛');
    R(flash, m, 'lightRange', 1, 30, 0.5, '빛 도달 (m)');
    // The three that fix a barrel this project guessed the end of.
    R(flash, m, 'forward', -0.6, 0.6, 0.005, '총신 방향 (m)');
    R(flash, m, 'up', -0.3, 0.3, 0.005, '총신 위 (m)');
    R(flash, m, 'right', -0.3, 0.3, 0.005, '총신 옆 (m)');

    const sparks = look.addFolder('격발');
    const i = g.impact;
    sparks.addColor(i, 'color').name('불꽃 색상');
    R(sparks, i, 'brightness', 0.2, 10, 0.1, '불꽃 발광');
    R(sparks, i, 'sparks', 0, 60, 1, '탄당 불꽃 수');
    R(sparks, i, 'speed', 0.5, 20, 0.1, '튐 속도 (m/s)');
    R(sparks, i, 'life', 0.05, 2, 0.01, '지속 (초)');
    R(sparks, i, 'size', 0.01, 0.3, 0.005, '크기 (m)');
    R(sparks, i, 'gravity', -40, 0, 0.5, '낙하 (m/s²)');

    this._buildFocus(folder);
  }

  /**
   * The held shot, in the order it happens: what earns it, what it costs the
   * thing it hits, and only then what it looks like.
   *
   * The seven layers of the burst each get their own sub-folder rather than one
   * long list, because the way anyone actually tunes a stack this deep is by
   * switching six of them off — and a `*Enabled` box at the top of its own
   * folder is a solo button.
   */
  _buildFocus(parent) {
    const R = Editor.range;
    const f = settings.gunplay.focus;
    const folder = parent.addFolder('강한 사격 (우클릭 꾹 누름)');

    folder.add(f, 'enabled').name('켜기');
    // The number the whole gesture is: three seconds of standing still in the
    // open. Under about one and it is not a decision, over about five and
    // nobody ever takes the shot.
    R(folder, f, 'charge', 0.2, 8, 0.1, '준비 시간 (초)');
    // 0 is "the offer stands while the button is down", which is the default.
    R(folder, f, 'hold', 0, 6, 0.1, '제안 만료 (초)');
    R(folder, f, 'speed', 50, 500, 5, '탄속 (m/s)');
    R(folder, f, 'drop', 0, 10, 0.1, '탄도 낙하 (m/s²)');
    R(folder, f, 'tracer', 1, 8, 0.1, '예광탄 일반 배율');

    const cost = folder.addFolder('피해량');
    R(cost, f, 'damage', 10, 500, 5, '몸 명중');
    R(cost, f, 'headDamage', 10, 600, 5, '머리 명중');
    // The one that decides whether this is an anti-body round or a way of
    // clearing a group.
    R(cost, f, 'blastRadius', 0, 12, 0.1, '폭발 반경 (m)');
    R(cost, f, 'blastDamage', 0, 400, 5, '중심부 폭발 피해');
    R(cost, f, 'impulse', 0, 20, 0.1, '밀침 (m/s)');
    R(cost, f, 'lift', 0, 12, 0.1, '띄움 (m/s)');
    R(cost, f, 'spin', 0, 8, 0.05, '접힘');

    const feel = folder.addFolder('감각');
    R(feel, f, 'recoilPitch', 0, 8, 0.05, '상반 반동 (도)');
    R(feel, f, 'recoilYaw', 0, 4, 0.05, '좌우 반동 (도)');
    R(feel, f, 'shake', 0, 0.5, 0.005, '발사 흔들림 (m)');
    R(feel, f, 'blastShake', 0, 0.6, 0.005, '착탄 흔들림 (m)');
    R(feel, f, 'hitStop', 0, 0.4, 0.005, '정지 (초)');
    R(feel, f, 'hitStopScale', 0.01, 1, 0.01, '정지 강도');

    const b = f.burst;
    const burst = folder.addFolder('폭발');
    burst.add(b, 'enabled').name('폭발 켜기');
    // The two masters. `radius` sets the scale of every shaped layer at once;
    // `life` is what the shell's and the core's own fractions are measured on.
    R(burst, b, 'radius', 0.5, 8, 0.05, '최대 반경 (m)');
    R(burst, b, 'life', 0.2, 4, 0.05, '지속 (초)');
    R(burst, b, 'intensity', 0.1, 4, 0.05, '밝기');
    R(burst, b, 'light', 0, 300, 1, '빛');
    R(burst, b, 'lightRange', 2, 80, 0.5, '빛 도달 (m)');
    burst.addColor(b, 'lightColor').name('빛 색상');

    const shell = burst.addFolder('1. 호 메쉬');
    shell.add(b, 'shellEnabled').name('표시');
    shell.addColor(b, 'shellColor').name('색상');
    shell.addColor(b, 'shellCoreColor').name('선 색상');
    R(shell, b, 'meridians', 1, 16, 1, '자오선');
    R(shell, b, 'parallels', 1, 12, 1, '위선');
    // A fraction of the gap between two lines, so it means the same thing at
    // any count.
    R(shell, b, 'arcWidth', 0.005, 0.4, 0.005, '호 너비');
    R(shell, b, 'shellRim', 0.5, 8, 0.1, '림 감쇠');
    R(shell, b, 'shellWarp', 0, 0.6, 0.005, '끓음 (m)');
    R(shell, b, 'shellDetail', 0.5, 8, 0.1, '끓음 디테일');
    R(shell, b, 'shellLife', 0.05, 1, 0.01, '수명 대비 비율');

    const core = burst.addFolder('2. 핵심');
    core.add(b, 'coreEnabled').name('표시');
    core.addColor(b, 'coreColor').name('색상');
    core.addColor(b, 'coreHalo').name('광배');
    R(core, b, 'coreSize', 0.2, 10, 0.05, '크기 (m)');
    R(core, b, 'coreLife', 0.02, 1, 0.01, '수명 대비 비율');
    R(core, b, 'coreSpikes', 0, 12, 1, '가시');
    R(core, b, 'coreSpikeLength', 0, 4, 0.05, '가시 길이');

    const decal = burst.addFolder('3. 균열');
    decal.add(b, 'decalEnabled').name('표시');
    decal.addColor(b, 'decalColor').name('색상');
    decal.addColor(b, 'decalCoreColor').name('뜨거운 색상');
    R(decal, b, 'decalRadius', 0.2, 12, 0.1, '반경 (m)');
    // Above this much floor clearance the round leaves no mark at all.
    R(decal, b, 'decalReach', 0.2, 10, 0.1, 'fades over (m) up');
    R(decal, b, 'decalDetail', 0.5, 16, 0.1, '그물 디테일');
    R(decal, b, 'decalSpokes', 0, 24, 1, '큰 균열');
    R(decal, b, 'decalScorch', 0, 2, 0.05, '태움');
    R(decal, b, 'decalWrite', 0.01, 1, 0.01, '덮어쓰기');

    const debris = burst.addFolder('4. 파편');
    debris.add(b, 'debrisEnabled').name('표시');
    debris.addColor(b, 'debrisColor').name('색상');
    R(debris, b, 'debris', 0, 48, 1, '조각 수');
    R(debris, b, 'debrisSize', 0.01, 0.6, 0.005, '크기 (m)');
    R(debris, b, 'debrisSpeed', 0.5, 30, 0.1, '튐 속도 (m/s)');
    R(debris, b, 'debrisSpread', 0, 2, 0.01, '퍼짐');
    R(debris, b, 'debrisGravity', -40, 0, 0.5, '낙하 (m/s²)');
    R(debris, b, 'debrisLife', 0.1, 4, 0.05, '지속 (초)');

    const shower = burst.addFolder('5. 불꽃');
    shower.add(b, 'sparksEnabled').name('표시');
    shower.addColor(b, 'sparkColor').name('색상');
    R(shower, b, 'sparks', 0, 200, 1, '불꽃 수');
    R(shower, b, 'sparkSpeed', 0.5, 40, 0.5, '튐 속도 (m/s)');
    R(shower, b, 'sparkSize', 0.005, 0.4, 0.005, '크기 (m)');
    R(shower, b, 'sparkLife', 0.05, 3, 0.05, '지속 (초)');
    R(shower, b, 'sparkStretch', 0, 0.3, 0.005, '줄무늬');
    R(shower, b, 'sparkDrag', 0.05, 8, 0.05, '공기 저항');
    R(shower, b, 'sparkGravity', -40, 0, 0.5, '낙하 (m/s²)');

    const shards = burst.addFolder('6. 파편');
    shards.add(b, 'shardsEnabled').name('표시');
    shards.addColor(b, 'shardColor').name('색상');
    shards.addColor(b, 'shardColorAlt').name('두 번째 색상');
    R(shards, b, 'shards', 0, 160, 1, '파편 수');
    R(shards, b, 'shardSpeed', 0.5, 40, 0.5, '튐 속도 (m/s)');
    R(shards, b, 'shardSize', 0.01, 0.8, 0.005, '길이 (m)');
    R(shards, b, 'shardLife', 0.05, 3, 0.05, '지속 (초)');
    R(shards, b, 'shardDrag', 0.05, 8, 0.05, '공기 저항');
    R(shards, b, 'shardGravity', -40, 0, 0.5, '낙하 (m/s²)');

    const haze = burst.addFolder('7. 연무');
    haze.add(b, 'hazeEnabled').name('표시');
    haze.addColor(b, 'hazeColor').name('색상');
    R(haze, b, 'haze', 0, 32, 1, '입자 수');
    R(haze, b, 'hazeOpacity', 0, 1, 0.01, '불투명도');
    R(haze, b, 'hazeSize', 0.1, 4, 0.05, '크기 (m)');
    R(haze, b, 'hazeGrowth', 1, 8, 0.05, '성장 배율');
    R(haze, b, 'hazeRise', 0, 6, 0.05, '상승 속도 (m/s)');
    R(haze, b, 'hazeLife', 0.1, 5, 0.05, '지속 (초)');
  }

  _buildCombat() {
    const folder = this.gui.addFolder('전투');
    const R = Editor.range;

    // One folder per move, built from the same three groups — every attack is
    // the same machine (`animation/Attack.js`) with different numbers, so there
    // is nothing to say about one of them that is not a field on all of them.
    this._buildAttack(folder, settings.kick, '발차기 (E)');
    this._buildAttack(folder, settings.slashHit, '베기 일격 (R)');
    this._buildAttack(folder, settings.crouchSlash, '슬라이드 베기 (T)');
    this._buildAttack(folder, settings.flipKick, '플립 킥 (Q)');
    this._buildAttack(folder, settings.swordCombo, '검격 연속 (Z)');
    this._buildSwordCombo(folder);
    this._buildAttack(folder, settings.voidBeam, '소멸 (B)');
    this._buildVoidBeam(folder);
    this._buildAttack(folder, settings.crimsonRite, '진홍 의식 (V)');
    this._buildCrimsonRite(folder);
    this._buildAttack(folder, settings.shadowExecution, '그림자 처형 (C)');
    this._buildShadowExecution(folder);
    this._buildTargetRing(folder);
    this._buildSlice(folder);

    const e = settings.enemies;
    const enemies = folder.addFolder('적');
    enemies.add(e, 'enabled').name('적 켜기');
    R(enemies, e, 'count', 0, 20, 1, '동시 존재 수');
    R(enemies, e, 'radius', 2, 40, 0.5, '생성 반경 (m)');
    R(enemies, e, 'minRadius', 1, 20, 0.5, '최소 거리 (m)');
    R(enemies, e, 'separation', 0.5, 6, 0.1, '서로 간격 (m)');
    R(enemies, e, 'height', 1, 3, 0.01, '높이 (m)');
    R(enemies, e, 'corpseTime', 0, 30, 0.5, '시체 유지 (초)');
    R(enemies, e, 'dissolveTime', 0.1, 6, 0.1, '소멸 시간 (초)');
    R(enemies, e, 'respawnDelay', 0, 15, 0.1, '리스폰 시간 (초)');
    enemies.add(e, 'watch').name('플레이어 주시');
    R(enemies, e, 'watchRadius', 2, 40, 0.5, '주시 거리 (m)');
    R(enemies, e, 'turnRate', 0.000001, 0.2, 0.000001, '회전 따라가기');
    enemies.add(e, 'collide').name('플레이어 막기');
    R(enemies, e, 'bodyRadius', 0.1, 1.5, 0.01, 'body radius (m)');
    enemies
      .add({ respawn: () => this.hooks.onRespawnEnemies?.() }, 'respawn')
      .name('전부 리스폰');

    // Authored rather than imported — the export carries no textures at all.
    const look = enemies.addFolder('외형');
    const el = e.look;
    look.addColor(el, 'color').name('몸 색상');
    R(look, el, 'roughness', 0, 1, 0.01, '거칠기');
    R(look, el, 'metalness', 0, 1, 0.01, '금속성');
    look.addColor(el, 'rimColor').name('림 색상');
    R(look, el, 'rimPower', 0.2, 8, 0.05, '림 집중도');
    R(look, el, 'rimEmissive', 0, 8, 0.01, '림 발광');
    look.addColor(el, 'edgeColor').name('소멸 색상');
    R(look, el, 'edgeEmissive', 0, 20, 0.1, '소멸 발광');
    R(look, el, 'edgeWidth', 0.01, 0.5, 0.01, '소멸 너비');
    R(look, el, 'dissolveDetail', 1, 40, 0.5, '소멸 디테일');
    R(look, el, 'dissolveRise', 0, 1, 0.01, '소멸 상승');

    // The ragdoll. `brace` is the one worth understanding: bone lengths alone
    // give a rope, and these extra constraints across the pelvis and chest are
    // what give the body a shape it is trying to keep as it falls.
    const doll = enemies.addFolder('래그돌');
    const r = e.ragdoll;
    R(doll, r, 'gravity', -60, -1, 0.5, '중력 (m/s²)');
    R(doll, r, 'damping', 0, 0.9, 0.01, '공기 저항 /s');
    R(doll, r, 'iterations', 1, 20, 1, '솔버 반복');
    R(doll, r, 'substeps', 1, 6, 1, '서브스텝');
    R(doll, r, 'brace', 0, 1, 0.01, '상체 강성');
    R(doll, r, 'radius', 0.01, 0.4, 0.005, '관절 반경 (m)');
    R(doll, r, 'friction', 0, 1, 0.01, '지면 마찰');
    R(doll, r, 'bounce', 0, 0.8, 0.01, '반발');
    R(doll, r, 'sleep', 0, 0.5, 0.005, '수면 임계값');
  }

  /**
   * One melee move's three groups: who it goes to, when it lands, what it does.
   *
   * The numbers to reach for after watching a move once are the normalised
   * times — the blow connects *here*, control comes back *there*, and the warp
   * has that long to put the body where the animator assumed it was standing.
   * Everything else follows from those three.
   *
   * @param {import('lil-gui').GUI} parent
   * @param {object} config a `settings.kick`-shaped block
   * @param {string} title what the folder is called, hotkey included
   */
  _buildAttack(parent, config, title) {
    const folder = parent.addFolder(title);
    const R = Editor.range;

    folder.add(config, 'enabled').name('켜기');

    // Who the blow goes to. `range` and `cone` decide what can be locked at
    // all; `standoff` is the distance the strike is thrown from, and it is the
    // one that decides whether the foot lands on the chest or through it.
    const aim = folder.addFolder('타깃 & 워프');
    R(aim, config, 'range', 0.5, 12, 0.05, '잠금 거리 (m)');
    R(aim, config, 'cone', 20, 360, 1, '잠금 각도 (°)');
    R(aim, config, 'standoff', 0.4, 2.5, 0.01, '공격 거리 (m)');
    R(aim, config, 'maxWarp', 0, 12, 0.05, '최대 접근 거리 (m)');
    // Only the combo states one: it stands still and throws for two thirds of
    // its clip before it closes, and the gap between this and `warpAt` is the
    // dash. Everything else begins closing on the frame it starts.
    if ('warpFrom' in config) R(aim, config, 'warpFrom', 0, 0.9, 0.01, '접근 시작 시점');
    R(aim, config, 'warpAt', 0.05, 0.9, 0.01, '접근 종료 시점');
    R(aim, config, 'turnAt', 0.05, 1, 0.01, '회전 완료 시점');
    // Only the two moves that do not stop on their mark carry these, so they
    // are on the blocks that asked for them rather than on every move. The
    // sign on the first is the direction: positive is the far side of the body
    // (the slide cut), negative is back off it (the flip kick).
    if ('passThrough' in config) {
      R(aim, config, 'passThrough', -5, 5, 0.05, '타깃에서 이만큼 떨어진 곳에서 끝남 (m)');
      if ('passFrom' in config) R(aim, config, 'passFrom', 0.05, 1, 0.01, '타깃 떠나는 시점');
      R(aim, config, 'passAt', 0.1, 1, 0.01, '통과 종료 시점');
    }

    // The clip's own timeline. Every time here is normalised, so `timeScale`
    // rides over all of them: it changes how long the move takes without moving
    // where in it the blow lands.
    const timing = folder.addFolder('타이밍');
    R(timing, config, 'hitAt', 0.05, 0.95, 0.01, '타격 연결 시점');
    R(timing, config, 'reach', 0.5, 4, 0.05, '연결 거리 (m)');
    R(timing, config, 'recoverAt', 0.3, 1, 0.01, '조작 복귀 시점');
    if ('timeScale' in config) R(timing, config, 'timeScale', 0.25, 3, 0.01, '재생 배율');
    R(timing, config, 'blendIn', 0.01, 0.6, 0.01, '블렌드 인 (초)');
    R(timing, config, 'blendOut', 0.01, 0.8, 0.01, '블렌드 아웃 (초)');

    // What the blow does. `spin` is the one with the least obvious name and the
    // most obvious effect: it is how much harder the shoulders are thrown than
    // the feet, which is the whole difference between sliding and folding.
    const impact = folder.addFolder('격발');
    R(impact, config, 'impulse', 0, 25, 0.1, '힘 (m/s)');
    R(impact, config, 'lift', 0, 15, 0.1, '띄움 (m/s)');
    R(impact, config, 'spin', 0, 4, 0.05, '상체 배율');
    R(impact, config, 'hitStop', 0, 0.3, 0.005, '히트 정지 (초)');
    R(impact, config, 'hitStopScale', 0, 1, 0.01, '히트 정지 배율');
    R(impact, config, 'shake', 0, 1, 0.01, '카메라 흔들림 (m)');
    // A fact about the move, not about the body it lands on — which is why it
    // is a field here and not in the enemies' block.
    if ('slices' in config) impact.add(config, 'slices').name('두 토막으로 절단');
  }


  /**
   * Everything the three-hit combo throws — see `vfx/SwordCombo.js`.
   *
   * The move's own numbers are in the `Sword combo (Z)` folder above, with
   * every other attack's, because it is the same machine as they are. This is
   * only the part of it that is *light*, and it is a folder of its own because
   * there is far more of it than of the move.
   *
   * If only one control here is ever touched, make it the crescent's `razor` —
   * it is where the hard white line sits along the leading edge, and it is the
   * whole difference between a cut and a glowing ribbon.
   */
  _buildSwordCombo(parent) {
    const folder = parent.addFolder('검격 연속 VFX');
    const R = Editor.range;
    const c = settings.swordCombo;

    // The crescents themselves: what is thrown, and what it is made of.
    const wave = folder.addFolder('날린 참격');
    wave.add(c.wave, '켜기').name('켜기');
    R(wave, c.wave, 'aimHeight', 0, 2.2, 0.01, '조준 높이 (m)');
    R(wave, c.wave, '크기', 0.4, 4, 0.05, '호 반경 (m)');
    R(wave, c.wave, 'speed', 8, 90, 1, '비행 속도 (m/s)');
    R(wave, c.wave, 'life', 0.2, 3, 0.05, '만료 (초)');
    R(wave, c.wave, 'hold', 0.05, 1, 0.01, '접촉 시 정지 (초)');
    R(wave, c.wave, 'finishLife', 0.1, 1.5, 0.01, '마무르 호 유지 (초)');
    R(wave, c.wave, 'homing', 0, 12, 0.1, '유도 강도 (1/s)');

    // The shape. `converge` and `tipTaper` decide the silhouette, `razor` and
    // `erode` decide whether it reads as an edge or as smoke.
    const shape = wave.addFolder('형태');
    R(shape, c.wave, '퍼짐', 0.6, 3.1, 0.01, '호 각도 (rad)');
    R(shape, c.wave, 'converge', 0, 0.95, 0.01, '안쪽 가장자리 휘어짐');
    R(shape, c.wave, 'bow', 0, 1, 0.01, '끝이 벌어짐 정도');
    R(shape, c.wave, 'tail', 0, 2, 0.01, '베일 길이 (반경 배수)');
    R(shape, c.wave, 'tipTaper', 0.15, 2, 0.01, '끝 날카로움');
    R(shape, c.wave, 'razor', 0.5, 0.995, 0.005, '가장자리 선 위치');
    R(shape, c.wave, 'erode', 0, 3, 0.01, '베일 잠식');
    R(shape, c.wave, 'grow', 0, 1.5, 0.01, '비행 중 열리는 양');

    const waveColour = wave.addFolder('색상');
    waveColour.addColor(c.wave, 'coreColor').name('가장자리 선');
    waveColour.addColor(c.wave, 'edgeColor').name('가장자리 발광');
    waveColour.addColor(c.wave, 'bodyColor').name('몸체');
    waveColour.addColor(c.wave, 'tailColor').name('베일');
    R(waveColour, c.wave, 'intensity', 0, 10, 0.05, '밝기');

    // The finisher's own shape, and the only thing in the move that is not a
    // cut. Five layers, one sub-folder each, in the order they are drawn — and
    // every one of them has an `enabled` at the top of its folder so it can be
    // soloed against the other four, which is the only sane way to tune a stack
    // of additive light.
    const rift = folder.addFolder('마무리 폭발');
    rift.add(c.rift, '켜기').name('켜기');

    // 1. The air around it, lit. There is no bloom pass worth the name on this
    //    stage, so this layer is the glow.
    const halo = rift.addFolder('1 · 광배');
    halo.add(c.rift, 'haloEnabled').name('켜기');
    R(halo, c.rift, 'haloRadius', 0.5, 14, 0.1, '도달 (m)');
    R(halo, c.rift, 'haloLife', 0.1, 2, 0.01, '지속 (초)');
    R(halo, c.rift, 'haloIntensity', 0, 6, 0.05, '밝기');
    halo.addColor(c.rift, 'haloColor').name('내부');
    halo.addColor(c.rift, 'haloEdgeColor').name('외부');

    // 2. The sphere, drawn on its rim. `rim tightness` is the control: high is
    //    a shell, low is a ball.
    const shell = rift.addFolder('2 · 외피');
    R(shell, c.rift, 'radius', 0.3, 6, 0.05, '도달 (m)');
    R(shell, c.rift, 'life', 0.1, 2, 0.01, '지속 (초)');
    R(shell, c.rift, '프레넬', 0.4, 6, 0.05, '림 집중도');
    R(shell, c.rift, 'churn', 0, 1, 0.01, '표면 변형');
    R(shell, c.rift, 'churnSpeed', 0, 8, 0.05, '표면 흐름');
    R(shell, c.rift, 'intensity', 0, 10, 0.05, '밝기');
    shell.addColor(c.rift, 'coreColor').name('섬광 (공유)');
    shell.addColor(c.rift, 'rimColor').name('림');
    shell.addColor(c.rift, 'deepColor').name('내부');

    // 3. The grain inside it. `smear` is what stops the field strobing.
    const motes = rift.addFolder('3 · 핵심');
    motes.add(c.rift, 'moteEnabled').name('켜기');
    R(motes, c.rift, 'moteCount', 0, 320, 1, '입자 수 (비용)');
    R(motes, c.rift, 'moteReach', 0.2, 8, 0.05, '튐 거리 (m)');
    R(motes, c.rift, 'moteLife', 0.1, 2, 0.01, '지속 (초)');
    R(motes, c.rift, 'moteSize', 0.005, 0.2, 0.001, '크기 (m)');
    R(motes, c.rift, 'moteStretch', 0, 0.1, 0.001, '흐림');
    R(motes, c.rift, 'escape', 0, 0.6, 0.01, '탈출 비율');
    R(motes, c.rift, 'escapeReach', 0, 6, 0.05, '탈출 거리 배율');
    R(motes, c.rift, 'moteIntensity', 0, 10, 0.05, '밝기');
    motes.addColor(c.rift, 'moteColor').name('색상');

    // 4. The shockwave, outrunning the shell on three planes.
    const rings = rift.addFolder('4 · 고리');
    R(rings, c.rift, 'ringRadius', 0.3, 10, 0.05, '도달 (m)');
    R(rings, c.rift, 'ringLife', 0.1, 2, 0.01, '지속 (초)');
    R(rings, c.rift, 'ringWidth', 0.01, 0.4, 0.005, '띠 너비');
    R(rings, c.rift, 'ringSoftness', 0.01, 0.5, 0.005, '띠 페더');
    R(rings, c.rift, 'ringSpin', 0, 10, 0.05, '회전 속도 (rad/s)');
    R(rings, c.rift, '살', 0, 60, 1, '살');
    R(rings, c.rift, 'spokeDepth', 0, 1, 0.01, '살 깊이');
    R(rings, c.rift, 'ringIntensity', 0, 10, 0.05, '밝기');
    rings.addColor(c.rift, 'ringColor').name('색상');

    // 5. The needles. `reach` is the single strongest control over the shape of
    //    the finisher; `out of plane` is what stops it being a flat sun.
    const shards = rift.addFolder('5 · 파편');
    shards.add(c.rift, 'shardEnabled').name('켜기');
    R(shards, c.rift, 'shardCount', 0, 28, 1, '바늘');
    R(shards, c.rift, 'shardLength', 0.5, 12, 0.1, '도달 (m)');
    R(shards, c.rift, 'shardWidth', 0.005, 0.3, 0.005, '너비 (m)');
    R(shards, c.rift, 'shardLife', 0.05, 1.2, 0.01, '지속 (초)');
    R(shards, c.rift, 'shardRoot', 0, 0.6, 0.01, '시작점 (도달 배수)');
    R(shards, c.rift, 'shardBias', 0, 1, 0.01, '평면 이탈');
    R(shards, c.rift, 'shardIntensity', 0, 10, 0.05, '밝기');
    shards.addColor(c.rift, 'shardColor').name('색상');

    // The flash and the shower — `vfx/BladeImpact.js`, and the three
    // multipliers that separate leaving, landing and finishing.
    const impact = folder.addFolder('섬광 & 불꽃');
    impact.add(c.impact, '켜기').name('켜기');
    R(impact, c, 'launchFlash', 0, 3, 0.05, '발사 시 섬광 배율');
    R(impact, c, 'arriveFlash', 0, 3, 0.05, '착탄 시 섬광 배율');
    R(impact, c, 'finishFlash', 0, 4, 0.05, '마무리 시 섬광 배율');
    R(impact, c.impact, 'life', 0.05, 1, 0.01, '섬광 수명 (초)');
    R(impact, c.impact, '크기', 0.1, 3, 0.05, '섬광 크기 (m)');
    R(impact, c.impact, 'intensity', 0, 10, 0.05, '밝기');
    R(impact, c.impact, '가시', 0, 16, 1, '별 가시');
    R(impact, c.impact, 'spikeLength', 0, 4, 0.05, '가시 길이');
    R(impact, c.impact, '불꽃 수', 0, 300, 1, '불꽃 수');
    R(impact, c.impact, 'sparkSpeed', 0, 30, 0.1, '불꽃 속도 (m/s)');
    R(impact, c.impact, 'sparkSpread', 0, 1.3, 0.01, '불꽃 콘 (rad)');
    R(impact, c.impact, 'sparkLife', 0.05, 2, 0.01, '불꽃 수명 (초)');
    R(impact, c.impact, 'sparkSize', 0.005, 0.15, 0.001, '불꽃 크기 (m)');
    R(impact, c.impact, 'sparkStretch', 0, 0.2, 0.001, '불꽃 줄무늬');
    R(impact, c.impact, 'sparkDrag', 0.05, 6, 0.05, '불꽃 저항');
    R(impact, c.impact, 'sparkGravity', -40, 0, 0.5, '불꽃 중력');
    impact.addColor(c.impact, 'color').name('섬광 색상');
    impact.addColor(c.impact, 'ringColor').name('고리 색상');
    impact.addColor(c.impact, 'sparkColor').name('불꽃 색상');

    // The ground's answer under the finisher — `vfx/ShockRing.js`.
    const shock = folder.addFolder('지면 파동');
    shock.add(c.shock, '켜기').name('켜기');
    R(shock, c.shock, 'radius', 0.5, 10, 0.1, '도달 (m)');
    R(shock, c.shock, 'life', 0.1, 2, 0.01, '소요 시간 (초)');
    R(shock, c.shock, 'intensity', 0, 8, 0.05, '밝기');
    R(shock, c.shock, 'width', 0.005, 0.4, 0.005, '선단 너비');
    R(shock, c.shock, 'softness', 0.005, 0.4, 0.005, '선단 페더');
    R(shock, c.shock, '균열 수', 0, 30, 1, '균열 수');
    R(shock, c.shock, 'crackLength', 0, 1.5, 0.01, '균열 길이');
    R(shock, c.shock, 'crackWidth', 0.001, 0.1, 0.001, '균열 너비');
    R(shock, c.shock, 'crackGlow', 0, 4, 0.05, '균열 발광');
    R(shock, c.shock, '띄움', 0, 0.2, 0.001, '바닥에서 띄움 (m)');
    shock.addColor(c.shock, 'color').name('선단 색상');
    shock.addColor(c.shock, 'crackColor').name('균열 색상');

    // One light for all of it. `decay` is the control that matters — long
    // enough and the whole combo is lit from its own cuts.
    const light = folder.addFolder('빛');
    R(light, c.light, 'intensity', 0, 120, 1, '최대');
    R(light, c.light, 'range', 2, 40, 0.5, '도달 (m)');
    R(light, c.light, 'decay', 0.05, 1.5, 0.01, '감쇠 시간 (초)');
    R(light, c.light, 'launch', 0, 1, 0.01, '발사 시 배율');
    R(light, c.light, 'arrive', 0, 1, 0.01, '착탄 시 배율');
    R(light, c.light, 'finish', 0, 1, 0.01, '마무리 시 배율');
    light.addColor(c.light, 'color').name('색상');

    // The one part of the move that happens on the body — `vfx/ShadowDash.js`.
    // `starts before` and `holds past` are stated against the move's own
    // approach (`warpFrom`/`warpAt` in the folder above), so retiming the dash
    // carries the burn with it and neither control has to be touched again.
    const dash = folder.addFolder('그림자 돌진');
    const d = c.shadowDash;
    dash.add(d, 'enabled').name('켜기');
    R(dash, d, 'lead', 0, 0.3, 0.005, '돌진 전 시작 (페이즈)');
    R(dash, d, 'linger', 0, 0.3, 0.005, '도착 후 유지 (페이즈)');
    R(dash, d, 'enter', 0.02, 1, 0.01, '어두워지는 시간 (초)');
    R(dash, d, 'exit', 0.02, 1.5, 0.01, '돌아오는 시간 (초)');
    R(dash, d, 'detail', 1, 40, 0.5, '소멸 디테일 (/m)');
    R(dash, d, 'rise', 0, 1, 0.01, '소멸 상승');
    R(dash, d, 'drift', 0, 4, 0.05, '필드 흐름 (/s)');
    R(dash, d, 'roughness', 0, 1, 0.01, '거칠기');
    R(dash, d, 'metalness', 0, 1, 0.01, '금속성');
    R(dash, d.fresnel, 'power', 0.2, 8, 0.05, '림 집중도');
    R(dash, d.fresnel, 'emissive', 0, 8, 0.01, '림 발광');
    // How much of the stage comes through the shade. `see-through curve` is the
    // one worth dragging: it is the exponent between the two solidities, and it
    // is the difference between a body of glass and a bare outline.
    R(dash, d.veil, 'core', 0, 1, 0.01, '정면 불투명도');
    R(dash, d.veil, '림', 0, 1, 0.01, '림 불투명도');
    R(dash, d.veil, 'power', 0.2, 6, 0.05, '투명도 곡선');
    R(dash, d, 'edgeEmissive', 0, 20, 0.1, '소멸 발광');
    R(dash, d, 'edgeWidth', 0.01, 0.5, 0.005, '소멸 너비');
    dash.addColor(d, 'color').name('그림자 색상');
    dash.addColor(d.fresnel, 'color').name('림 색상');
    dash.addColor(d, 'edgeColor').name('소멸 색상');
  }

  /**
   * Everything the unmaking calls up — see `vfx/RunicBeam.js`.
   *
   * The move's own numbers are in the `Unmaking (B)` folder above, with every
   * other attack's, because it is the same machine as they are. This is the
   * part of it that is *light*, plus the one block that is neither — `unmake`,
   * which is how a body taken by the beam goes away.
   *
   * Five layers, a sub-folder each, in the order they are drawn, and every one
   * with an `enabled` at the top of its folder so it can be soloed against the
   * other four.
   *
   * If only one control here is ever touched, make it the beam's `axis gather`:
   * it is the exponent on how square a piece of the wall is to the lens, and it
   * is the whole difference between a column of light and a glowing pipe.
   */
  _buildVoidBeam(parent) {
    const folder = parent.addFolder('소멸 VFX');
    const R = Editor.range;
    const c = settings.voidBeam;

    // The pacing. `charge` is the odd one: it is a timeout rather than a beat,
    // and it has to stay longer than the gap between the clip's two strikes.
    const beats = folder.addFolder('타이밍');
    R(beats, c.beats, 'open', 0.05, 1.5, 0.01, '룬 새김 (초)');
    R(beats, c.beats, 'charge', 0.2, 3, 0.01, '최대 충전 시간 (초)');
    R(beats, c.beats, 'strike', 0.05, 1, 0.01, '기둥 솟음 (초)');
    R(beats, c.beats, 'hold', 0.1, 4, 0.05, '지속 (초)');
    R(beats, c.beats, 'close', 0.05, 2, 0.01, '소멸 시간 (초)');
    R(beats, c.beats, 'ripple', 0.05, 1.5, 0.01, '룬 파문 (초)');

    // 1. The circle on the ground. The same shader the light's seal uses.
    const seal = folder.addFolder('1 · 룬');
    R(seal, c.seal, 'radius', 0.4, 6, 0.05, '반경 (m)');
    R(seal, c.seal, '띄움', 0, 0.3, 0.005, '바닥에서 띄움 (m)');
    R(seal, c.seal, 'intensity', 0, 6, 0.05, '밝기');
    R(seal, c.seal, 'spin', -1, 1, 0.005, '초당 회전');
    R(seal, c.seal, '눈금', 4, 120, 1, '눈금');
    R(seal, c.seal, '룬', 3, 40, 1, '문자 수');
    R(seal, c.seal, '살', 2, 24, 1, '살');
    R(seal, c.seal, 'width', 0.002, 0.06, 0.001, '선 굵기');
    R(seal, c.seal, 'softness', 0.002, 0.06, 0.001, '선 페더');
    R(seal, c.seal, 'haze', 0, 1.5, 0.01, '내부 모인 빛');
    R(seal, c.seal, 'detail', 0, 1, 0.01, '얼룩짐');
    R(seal, c.seal, 'pulse', 0, 1, 0.01, '호흡 깊이');
    R(seal, c.seal, 'pulseSpeed', 0, 14, 0.1, '호흡 속도');
    seal.addColor(c.seal, 'color').name('선');
    seal.addColor(c.seal, 'coreColor').name('중심');

    // 2. The column. `axis gather` is the control; everything else dresses it.
    const beam = folder.addFolder('2 · 광선');
    beam.add(c.beam, '켜기').name('켜기');
    R(beam, c.beam, 'height', 1, 20, 0.1, '높이 (m)');
    R(beam, c.beam, 'radius', 0.05, 3, 0.01, '반경 (m)');
    R(beam, c.beam, 'flare', 0, 2, 0.01, 'foot flare');
    R(beam, c.beam, 'swell', 0, 1.5, 0.01, 'swell on opening');
    R(beam, c.beam, 'breathe', 0, 0.2, 0.005, '호흡 깊이');
    R(beam, c.beam, 'breatheSpeed', 0, 20, 0.1, '호흡 속도');
    R(beam, c.beam, 'corePower', 0.2, 10, 0.05, '축 집중');
    R(beam, c.beam, 'glowPower', 0.1, 4, 0.05, '빛 퍼짐');
    R(beam, c.beam, 'grain', 0.2, 12, 0.05, '세로 디테일');
    R(beam, c.beam, 'swirl', 0.2, 6, 0.05, '가로 디테일');
    R(beam, c.beam, 'flow', 0, 8, 0.05, '낙하 속도');
    R(beam, c.beam, 'erode', 0, 1.5, 0.01, '노이즈 잠식');
    R(beam, c.beam, 'headWidth', 0.005, 0.4, 0.005, '상단 띠');
    R(beam, c.beam, 'footGlow', 0.01, 0.6, 0.005, '하단 발광');
    R(beam, c.beam, 'crown', 0.1, 0.999, 0.005, '상단 페이드 시작');
    R(beam, c.beam, 'intensity', 0, 8, 0.05, '밝기');
    beam.addColor(c.beam, 'coreColor').name('축');
    beam.addColor(c.beam, 'innerColor').name('몸체');
    beam.addColor(c.beam, 'edgeColor').name('가장자리');

    // 3. The cords. `count` is capped at 6 by the buffer they share.
    const spiral = folder.addFolder('3 · 소용돌이');
    spiral.add(c.spiral, '켜기').name('켜기');
    R(spiral, c.spiral, 'count', 0, 6, 1, 'cords');
    R(spiral, c.spiral, 'radius', 0.05, 3, 0.01, '반경 (m)');
    R(spiral, c.spiral, 'reach', 0.1, 1.2, 0.01, 'run × the height');
    R(spiral, c.spiral, 'turns', 0.2, 8, 0.05, 'turns');
    R(spiral, c.spiral, 'width', 0.005, 0.4, 0.005, '너비 (m)');
    R(spiral, c.spiral, 'taper', 0, 1, 0.01, 'width left at the top');
    R(spiral, c.spiral, 'spin', -8, 8, 0.05, '회전 속도 (rad/s)');
    R(spiral, c.spiral, 'flare', 0, 2, 0.01, 'opens out by');
    R(spiral, c.spiral, 'sharpness', 0.5, 8, 0.05, '가장자리 감쇠');
    R(spiral, c.spiral, 'pulse', 0, 40, 0.5, 'waves along it');
    R(spiral, c.spiral, 'intensity', 0, 8, 0.05, '밝기');
    spiral.addColor(c.spiral, 'coreColor').name('중앙');
    spiral.addColor(c.spiral, 'colorA').name('코드 A');
    spiral.addColor(c.spiral, 'colorB').name('코드 B');

    // 4. The burst at its foot — the blades' own system again.
    const impact = folder.addFolder('4 · 폭발');
    impact.add(c.impact, '켜기').name('켜기');
    R(impact, c, 'strikeFlash', 0, 3, 0.05, 'size ×');
    R(impact, c, 'impactHeight', 0, 3, 0.05, 'thrown at height (m)');
    R(impact, c.impact, 'life', 0.05, 1.5, 0.01, '섬광 수명 (초)');
    R(impact, c.impact, '크기', 0.1, 4, 0.05, '섬광 크기 (m)');
    R(impact, c.impact, 'intensity', 0, 10, 0.05, '밝기');
    R(impact, c.impact, '가시', 0, 16, 1, '별 가시');
    R(impact, c.impact, 'spikeLength', 0, 4, 0.05, '가시 길이');
    R(impact, c.impact, '불꽃 수', 0, 300, 1, '불꽃 수');
    R(impact, c.impact, 'sparkSpeed', 0, 30, 0.1, '불꽃 속도 (m/s)');
    R(impact, c.impact, 'sparkSpread', 0, 1.3, 0.01, '불꽃 콘 (rad)');
    R(impact, c.impact, 'sparkLife', 0.05, 2, 0.01, '불꽃 수명 (초)');
    R(impact, c.impact, 'sparkSize', 0.005, 0.15, 0.001, '불꽃 크기 (m)');
    R(impact, c.impact, 'sparkStretch', 0, 0.2, 0.001, '불꽃 줄무늬');
    R(impact, c.impact, 'sparkDrag', 0.05, 6, 0.05, '불꽃 저항');
    R(impact, c.impact, 'sparkGravity', -40, 0, 0.5, '불꽃 중력');
    impact.addColor(c.impact, 'color').name('섬광 색상');
    impact.addColor(c.impact, 'ringColor').name('고리 색상');
    impact.addColor(c.impact, 'sparkColor').name('불꽃 색상');

    // 5. The grain. `count` is nearly free — each shard is a closed form.
    const grain = folder.addFolder('5 · 입자');
    grain.add(c.grain, '켜기').name('켜기');
    R(grain, c.grain, 'count', 0, 320, 1, '파편 수');
    R(grain, c.grain, 'radius', 0.05, 4, 0.05, 'start out at (m)');
    R(grain, c.grain, '퍼짐', 0, 4, 0.05, 'drift out by (m)');
    R(grain, c.grain, 'rise', 0.5, 16, 0.1, 'climb (m)');
    R(grain, c.grain, 'swirl', -10, 10, 0.05, '회전 속도 (rad/s)');
    R(grain, c.grain, '크기', 0.005, 0.4, 0.005, '크기 (m)');
    R(grain, c.grain, 'life', 0.2, 6, 0.05, 'one loop takes (s)');
    R(grain, c.grain, 'spike', 1, 16, 0.1, 'needle length');
    R(grain, c.grain, 'intensity', 0, 8, 0.05, '밝기');
    grain.addColor(c.grain, 'color').name('파편');
    grain.addColor(c.grain, 'coreColor').name('중심');

    // The light, hung partway up rather than at the foot.
    const light = folder.addFolder('빛');
    R(light, c.light, 'intensity', 0, 200, 1, '최대');
    R(light, c.light, 'range', 2, 45, 0.5, '도달 (m)');
    R(light, c.light, 'decay', 0.05, 2, 0.01, 'flash decays over (s)');
    R(light, c.light, 'height', 0, 1, 0.01, 'hangs at × the height');
    R(light, c.light, 'hold', 0, 2, 0.01, 'standing ×');
    R(light, c.light, 'gather', 0, 2, 0.01, 'gathering ×');
    light.addColor(c.light, 'color').name('색상');

    // Not light at all: how the body it takes goes away. It is here rather than
    // in `Enemies` for the same reason `cuts in half` is on the move — what
    // killed a body decides how it leaves, and this block is that decision.
    const unmake = folder.addFolder('소멸');
    R(unmake, c.unmake, 'corpseTime', 0, 6, 0.05, 'lies there (s)');
    R(unmake, c.unmake, 'dissolveTime', 0.1, 6, 0.05, '소멸 시간 (초)');
    R(unmake, c.unmake, 'edgeEmissive', 0, 20, 0.1, 'burn line heat');
    R(unmake, c.unmake, 'edgeWidth', 0.01, 0.6, 0.005, 'burn line width');
    R(unmake, c.unmake, 'dissolveRise', 0, 1, 0.01, 'burns bottom-up by');
    unmake.addColor(c.unmake, 'edgeColor').name('소멸 선');
  }

  /**
   * Everything the crimson rite calls up — see `vfx/CrimsonRite.js`.
   *
   * The move's own numbers are in the `Crimson rite (V)` folder above, with
   * every other attack's, because it is the same machine as they are. This is
   * the part of it that is *light* — and there is a great deal more of it than
   * of the move, which is why it is a folder of its own.
   *
   * The folders are numbered in the order the layers are drawn, which is also
   * the order the reference breaks the effect into. Every one of them has an
   * `enabled` at the top so it can be soloed against the other five, and that
   * is by far the fastest way to understand what any single number is doing.
   *
   * If only one control here is ever touched, make it the strokes' `tear`: it
   * is how hard a stroke comes apart as it dies, and it is the whole difference
   * between a cut and a glowing ribbon fading out.
   */
  _buildCrimsonRite(parent) {
    const folder = parent.addFolder('진홍 의식 VFX');
    const R = Editor.range;
    const c = settings.crimsonRite;

    // The pacing. Everything after the cast is here rather than in `hits`,
    // because the clip only marks two frames and the move has four impacts.
    const beats = folder.addFolder('안무');
    R(beats, c, 'height', 0, 2.4, 0.01, 'blades ring at (m)');
    R(beats, c, 'stabs', 1, 6, 1, 'thrusts');
    R(beats, c, 'wound', 0, 20, 0.5, 'per thrust (health)');
    R(beats, c.beats, 'mark', 0.05, 2, 0.01, 'ink wells up over (s)');
    R(beats, c.beats, 'charge', 0.2, 4, 0.05, 'gives up after (s)');
    R(beats, c.beats, 'between', 0.05, 1, 0.01, 'thrusts ordered every (s)');
    R(beats, c.beats, 'hold', 0, 1.5, 0.01, 'held on the points (s)');
    R(beats, c.beats, 'rend', 0.1, 2, 0.05, 'tear-out (s)');
    R(beats, c.beats, 'settle', 0.1, 3, 0.05, 'ink sinks over (s)');
    R(beats, c.beats, 'abandon', 0.5, 8, 0.05, 'gives up waiting after (s)');
    R(beats, c, 'stabShake', 0, 1, 0.01, 'thrust shake (m)');
    R(beats, c, 'rendShake', 0, 1, 0.01, 'tear-out shake (m)');
    R(beats, c, 'markRing', 0, 3, 0.05, 'mark ring ×');
    R(beats, c, 'stabRing', 0, 3, 0.05, 'thrust ring ×');
    R(beats, c, 'rendRing', 0, 3, 0.05, 'tear-out ring ×');
    R(beats, c, 'stabMist', 0, 4, 0.05, 'thrust cloud ×');
    R(beats, c, 'rendMist', 0, 4, 0.05, 'tear-out cloud ×');

    /* ---- 1 · the strokes ---- */
    const trails = folder.addFolder('1. 베기 자국');
    const t = c.trails;
    trails.add(t, 'enabled').name('표시');
    trails.addColor(t, 'coreColor').name('날 색상');
    trails.addColor(t, 'color').name('몸 색상');
    trails.addColor(t, 'edgeColor').name('꼬리 색상');
    R(trails, t, 'intensity', 0, 8, 0.05, '밝기');
    R(trails, t, 'razor', 0, 1, 0.01, 'razor sits at');
    R(trails, t, 'razorWidth', 0.01, 0.5, 0.005, 'razor width');
    R(trails, t, 'core', 0, 5, 0.05, 'razor heat');
    R(trails, t, 'falloff', 0.2, 6, 0.05, 'body falloff');
    R(trails, t, 'tip', 0.05, 2, 0.01, '끝 날카로움');
    R(trails, t, 'draw', 0.01, 0.9, 0.01, 'swept over (of life)');
    R(trails, t, 'headSoft', 0.01, 0.4, 0.005, 'head feather');
    R(trails, t, 'headFlare', 0, 6, 0.05, 'head heat');
    R(trails, t, 'detail', 0.2, 12, 0.1, 'tear detail');
    R(trails, t, 'flow', 0, 6, 0.05, '찢김 흐름');
    R(trails, t, 'tear', 0, 3, 0.01, 'tears apart by');
    R(trails, t, 'hair', 2, 80, 0.5, 'filaments');
    R(trails, t, 'hairDepth', 0, 1, 0.01, 'filament depth');

    // The same look, twice, as two gestures. A big radius with a small sweep is
    // a nearly straight streak (a thrust); a small radius with a large sweep is
    // most of a circle (the tear-out).
    for (const [key, title] of [
      ['stabArc', "1a. The thrust's stroke"],
      ['rendArc', "1b. The tear-out's strokes"]
    ]) {
      const arc = folder.addFolder(title);
      const a = c[key];
      R(arc, a, 'count', 0, 8, 1, 'strokes');
      R(arc, a, 'spread', 0, 2, 0.01, 'fan opens by (rad)');
      R(arc, a, 'radius', 0.2, 6, 0.05, '호 반경 (m)');
      R(arc, a, 'sweep', 0.1, 5, 0.05, 'arc spans (rad)');
      R(arc, a, 'width', 0.02, 1.5, 0.01, 'width (of radius)');
      R(arc, a, 'life', 0.05, 2, 0.01, '지속 (초)');
      R(arc, a, 'pitch', 0, 3, 0.05, 'sheared forward by');
      R(arc, a, 'strength', 0, 3, 0.05, 'master ×');
    }

    /* ---- 2 · the mist ---- */
    const mist = folder.addFolder('2. 피 안개 & 튐');
    const m = c.mist;
    mist.add(m, 'enabled').name('표시');
    mist.addColor(m, 'deepColor').name('짙은 색상');
    mist.addColor(m, 'color').name('몸 색상');
    mist.addColor(m, 'hotColor').name('뜨거운 색상');
    R(mist, m, 'intensity', 0, 3, 0.01, 'master ×');
    R(mist, m, 'drag', 0.05, 10, 0.05, '공기 저항');
    R(mist, m, 'gravity', -30, 0, 0.1, '낙하 (m/s²)');
    R(mist, m, 'haze', 0, 90, 1, 'cloud puffs');
    R(mist, m, 'puffSpeed', 0, 10, 0.05, 'puffs thrown at (m/s)');
    R(mist, m, 'puffRise', -2, 4, 0.05, 'puffs lift (m/s)');
    R(mist, m, 'puffLife', 0.1, 4, 0.05, 'puffs last (s)');
    R(mist, m, 'size', 0.05, 2, 0.01, 'puff size (m)');
    R(mist, m, 'grow', 0, 8, 0.05, 'puff grows by ×');
    R(mist, m, 'opacity', 0, 1, 0.01, 'cloud opacity');
    R(mist, m, 'setback', 0, 1.5, 0.01, 'cloud sits back (m)');
    R(mist, m, 'erode', 0, 1.5, 0.01, 'cloud raggedness');
    R(mist, m, 'detail', 0.2, 10, 0.1, 'cloud detail');
    R(mist, m, 'churn', 0, 4, 0.05, 'cloud churn');
    R(mist, m, 'drops', 0, 140, 1, 'drops');
    R(mist, m, 'dropSpeed', 0, 30, 0.1, 'drops thrown at (m/s)');
    R(mist, m, 'dropLife', 0.05, 3, 0.05, 'drops last (s)');
    R(mist, m, 'spray', 0, 2, 0.01, 'drop cone (rad)');
    R(mist, m, 'splatSize', 0.005, 0.3, 0.005, 'drop size (m)');
    R(mist, m, 'splatStretch', 0, 8, 0.05, 'drop stretch');
    R(mist, m, 'hot', 0, 2, 0.01, 'heat in the blood');

    /* ---- 3 · the floor ---- */
    const rings = folder.addFolder('3. 격발 충격파');
    const g = c.rings;
    rings.add(g, 'enabled').name('표시');
    rings.addColor(g, 'color').name('선단 색상');
    rings.addColor(g, 'coreColor').name('섬광 색상');
    rings.addColor(g, 'crackColor').name('균열 색상');
    rings.addColor(g, 'scorchColor').name('소멸 색상');
    R(rings, g, 'intensity', 0, 6, 0.05, '밝기');
    R(rings, g, 'radius', 0.5, 10, 0.1, '도달 (m)');
    R(rings, g, 'life', 0.2, 5, 0.05, '지속 (초)');
    R(rings, g, 'rings', 1, 6, 1, 'fronts in the train');
    R(rings, g, 'ringGap', 0.02, 0.4, 0.005, 'launched apart by (of life)');
    R(rings, g, 'ringReach', 0.4, 1, 0.01, 'each reaches ×');
    R(rings, g, 'width', 0.005, 0.2, 0.001, '선단 너비');
    R(rings, g, 'softness', 0.005, 0.2, 0.001, '선단 페더');
    R(rings, g, 'cracks', 0, 40, 1, '균열 수');
    R(rings, g, 'crackLength', 0.1, 1, 0.01, 'crack length');
    R(rings, g, 'crackWidth', 0.002, 0.08, 0.001, '균열 너비');
    R(rings, g, 'crackGlow', 0, 5, 0.05, 'crack heat');
    R(rings, g, 'scorch', 0, 1, 0.01, 'burn depth');
    R(rings, g, 'scorchRadius', 0.05, 1, 0.01, 'burn reaches');
    R(rings, g, 'scorchFade', 0.05, 1, 0.01, 'burn fades over');
    R(rings, g, 'lift', 0, 0.2, 0.005, '바닥에서 띄움 (m)');

    /* ---- 4 · the ink ---- */
    const aura = folder.addFolder('4. 어두운 후광');
    const a = c.aura;
    aura.add(a, 'enabled').name('표시');
    aura.addColor(a, 'inkColor').name('잉크 색상');
    aura.addColor(a, 'rimColor').name('림 색상');
    R(aura, a, 'opacity', 0, 1, 0.01, '불투명도');
    R(aura, a, 'rim', 0, 2, 0.01, 'rim heat');
    R(aura, a, 'radius', 0.2, 5, 0.05, 'stands out at (m)');
    R(aura, a, 'height', 0.5, 8, 0.05, '최대 높이 (m)');
    R(aura, a, 'scale', 0.2, 5, 0.05, 'feature size');
    R(aura, a, 'rise', 0, 3, 0.01, 'climbs at');
    R(aura, a, 'warp', 0, 3, 0.01, 'threads hook by');
    R(aura, a, 'threshold', 0.1, 0.95, 0.01, 'ink cut at');
    R(aura, a, 'sharpness', 0.01, 0.6, 0.005, 'cut sharpness');
    R(aura, a, 'curl', 0, 2, 0.01, 'lean at the top (m)');
    R(aura, a, 'curlSpeed', 0, 4, 0.05, 'lean speed');
    R(aura, a, 'swirl', 0, 2, 0.01, 'shell turns at');

    /* ---- 5 · the cinders ---- */
    const cinders = folder.addFolder('5. 불씨 & 입자');
    const e = c.cinders;
    cinders.add(e, 'enabled').name('표시');
    cinders.addColor(e, 'color').name('색상');
    cinders.addColor(e, 'coreColor').name('뜨거운 색상');
    R(cinders, e, 'intensity', 0, 8, 0.05, '밝기');
    R(cinders, e, 'speed', 0, 30, 0.1, '튐 속도 (m/s)');
    R(cinders, e, 'life', 0.1, 4, 0.05, '지속 (초)');
    R(cinders, e, 'drag', 0.05, 8, 0.05, '공기 저항');
    R(cinders, e, 'gravity', -20, 4, 0.1, '낙하 (m/s²)');
    R(cinders, e, 'rise', -2, 5, 0.05, '띄움 (m/s)');
    R(cinders, e, 'size', 0.005, 0.15, 0.001, '크기 (m)');
    R(cinders, e, 'stretch', 0, 8, 0.05, 'stretched by speed');
    R(cinders, e, 'maxStretch', 1, 24, 0.5, 'longest streak ×');
    R(cinders, e, 'halo', 0, 2, 0.01, '광배');
    R(cinders, e, 'flicker', 0, 1, 0.01, 'flicker depth');
    R(cinders, e, 'flickerSpeed', 1, 60, 0.5, 'flicker speed');
    R(cinders, e, 'stabCount', 0, 120, 1, 'shed per thrust');
    R(cinders, e, 'stabStrength', 0, 3, 0.05, 'thrust ×');
    R(cinders, e, 'spread', 0, 2, 0.01, 'shed cone (rad)');
    R(cinders, e, 'rendCount', 0, 300, 1, 'thrown by the tear-out');
    R(cinders, e, 'rendStrength', 0, 3, 0.05, 'tear-out ×');
    R(cinders, e, 'rendRadius', 0, 3, 0.05, 'tear-out spread (m)');
    R(cinders, e, 'drift', 0, 120, 1, 'drift out of the ink (/s)');
    R(cinders, e, 'driftHeight', 0, 2, 0.01, 'drift starts at (m)');
    R(cinders, e, 'driftSpread', 0, 2, 0.01, 'drift spread (of radius)');
    R(cinders, e, 'driftStrength', 0, 2, 0.01, 'drift ×');

    /* ---- 6 · the blades ---- */
    const blades = folder.addFolder('6. 도검');
    const b = c.blades;
    blades.add(b, 'enabled').name('표시');
    R(blades, b, 'count', 1, 6, 1, 'blades');
    // Rebuilds the pool when it moves — the scale is baked into the template
    // rather than onto the instances, so this is the one control here that is
    // not free. It is still live; it just does more work than its neighbours.
    R(blades, b, 'length', 0.4, 3, 0.01, '길이 (m)');
    blades.add(b, 'flip').name('끝점이 반대쪽');
    R(blades, b, 'standoff', 0.3, 5, 0.05, 'wait at (m)');
    R(blades, b, 'bite', 0, 1.5, 0.01, 'drive in to (m)');
    R(blades, b, 'spreadHeight', 0, 1.5, 0.01, 'height spread (m)');
    R(blades, b, 'stagger', 0, 0.6, 0.01, 'arrive apart by (s)');
    R(blades, b, 'gatherDrift', 0, 2, 0.01, 'drifts in by (m)');
    R(blades, b, 'hover', 0, 0.4, 0.005, 'hover (m)');
    R(blades, b, 'hoverSpeed', 0, 10, 0.1, 'hover speed');
    R(blades, b, 'spin', 0, 8, 0.05, 'turns at ± (rad/s)');
    R(blades, b, 'quiver', 0, 0.2, 0.001, 'ring in the steel (m)');
    R(blades, b, 'quiverSpeed', 5, 120, 1, 'ring speed');
    R(blades, b, 'quiverDecay', 1, 30, 0.5, 'ring dies at');
    R(blades, b, 'throughDistance', 0.5, 8, 0.05, 'leaves out to (m)');
    R(blades, b, 'throughLift', 0, 4, 0.05, 'leaves rising by (m)');
    R(blades, b, 'throughArc', 0, 3, 0.05, 'exit arc (m)');
    R(blades, b, 'throughRoll', 0, 12, 0.1, 'rolls out by (rad)');
    R(blades, b, 'fadeRise', 0, 4, 0.05, 'drifts up at (m/s)');
    R(blades, b.beats, 'gather', 0.05, 1.5, 0.01, 'resolves over (s)');
    R(blades, b.beats, 'thrust', 0.03, 0.6, 0.005, 'thrust takes (s)');
    R(blades, b.beats, 'wrench', 0.05, 2, 0.01, 'tear-out takes (s)');
    R(blades, b.beats, 'fade', 0.05, 2, 0.01, 'burns off over (s)');

    const steel = blades.addFolder('강철');
    steel.addColor(b, 'bodyColor').name('몸체');
    steel.addColor(b, 'sheenColor').name('광택');
    steel.addColor(b, 'rimColor').name('림');
    R(steel, b, 'rim', 0, 5, 0.05, '림 강도');
    R(steel, b, 'rimPower', 0.2, 8, 0.05, '림 집중도');
    steel.addColor(b, 'edgeColor').name('소멸 선');
    R(steel, b, 'edgeEmissive', 0, 24, 0.1, 'burn line heat');
    R(steel, b, 'edgeWidth', 0.01, 0.6, 0.005, 'burn line width');
    R(steel, b, 'detail', 2, 120, 0.5, '소멸 디테일');
    R(steel, b, 'burnRise', 0, 1, 0.01, 'burn runs along by');
    R(steel, b, 'veins', 0, 2, 0.01, 'energy in the steel');
    R(steel, b, 'veinFlow', 0, 6, 0.05, 'energy speed');

    /* ---- the one light all six share ---- */
    const light = folder.addFolder('빛 자체');
    const l = c.light;
    light.addColor(l, 'color').name('색상');
    R(light, l, 'intensity', 0, 60, 0.5, '밝기');
    R(light, l, 'range', 1, 40, 0.5, 'range (m)');
    R(light, l, 'decay', 0.05, 2, 0.01, 'falls away over (s)');
    R(light, l, 'mark', 0, 1, 0.01, 'mark ×');
    R(light, l, 'stab', 0, 1, 0.01, 'thrust ×');
    R(light, l, 'rend', 0, 1, 0.01, 'tear-out ×');

    /* ---- and how the body leaves ---- */
    const burn = folder.addFolder('소멸');
    const u = c.unmake;
    R(burn, u, 'corpseTime', 0, 6, 0.05, 'lies there (s)');
    R(burn, u, 'dissolveTime', 0.1, 6, 0.05, '소멸 시간 (초)');
    burn.addColor(u, 'edgeColor').name('소멸 선');
    R(burn, u, 'edgeEmissive', 0, 24, 0.1, 'burn line heat');
    R(burn, u, 'edgeWidth', 0.01, 0.6, 0.005, 'burn line width');
    R(burn, u, 'dissolveRise', 0, 1, 0.01, 'burns bottom-up by');
  }

  /**
   * The shadow execution's own layers — see `vfx/ShadowExecution.js`.
   *
   * The move itself is tuned in the plain attack folder above, exactly as the
   * rite's is. This is the part that is *light*, and there is a great deal more
   * of it than there is of the move.
   *
   * The folders are numbered in the order the layers are drawn, which is also
   * the order the reference breaks the effect into. Nearly every one has an
   * `enabled` at the top so it can be soloed against the other eight, which is
   * by far the fastest way to understand what any single number is doing.
   *
   * If only one control here is ever touched, make it **the ring's `winds up
   * to`**. The whole first half of this ability is five katanas accelerating
   * round a body, and that number is the acceleration: at 1 they drift and the
   * move is a summons followed by a stab, and past about 7 they are a blur with
   * nothing left to count.
   */
  _buildShadowExecution(parent) {
    const folder = parent.addFolder('그림자 처형 VFX');
    const R = Editor.range;
    const c = settings.shadowExecution;

    // The pacing. Everything after the cast is here rather than in `hits`,
    // because the clip only marks two frames and the move has two more impacts.
    const beats = folder.addFolder('안무');
    R(beats, c, 'height', 0, 2.4, 0.01, 'blades ring at (m)');
    R(beats, c, 'wound', 0, 100, 1, 'the impact costs (health)');
    R(beats, c.beats, 'mark', 0.05, 2, 0.01, 'dark wells up over (s)');
    R(beats, c.beats, 'charge', 0.2, 4, 0.05, 'gives up after (s)');
    R(beats, c.beats, 'circle', 0.2, 3, 0.05, 'ring winds up over (s)');
    R(beats, c.beats, 'pin', 0, 1.5, 0.01, 'held on the points (s)');
    R(beats, c.beats, 'sever', 0.1, 2, 0.05, 'tear-out (s)');
    R(beats, c.beats, 'settle', 0.1, 3, 0.05, 'dark sinks over (s)');
    R(beats, c.beats, 'abandon', 0.2, 4, 0.05, 'gives up waiting after (s)');
    R(beats, c, 'impaleShake', 0, 1, 0.01, 'impact shake (m)');
    R(beats, c, 'severShake', 0, 1, 0.01, 'tear-out shake (m)');
    R(beats, c, 'markRing', 0, 3, 0.05, 'mark ring ×');
    R(beats, c, 'impaleRing', 0, 3, 0.05, 'impact ring ×');
    R(beats, c, 'severRing', 0, 3, 0.05, 'tear-out ring ×');

    /* ---- 1 · the light on the floor ---- */
    const glow = folder.addFolder('1. 지면 발광');
    const w = c.glow;
    glow.addColor(w, 'color').name('퍼짐 색상');
    glow.addColor(w, 'coreColor').name('핵심 색상');
    R(glow, w, 'intensity', 0, 8, 0.05, '밝기');
    R(glow, w, 'radius', 0.5, 8, 0.1, '도달 (m)');
    R(glow, w, 'falloff', 0.2, 6, 0.05, '퍼짐 감쇠');
    R(glow, w, 'core', 0, 1, 0.01, 'core takes');
    R(glow, w, 'corePower', 0.5, 8, 0.05, '핵심 집중도');
    R(glow, w, 'pulse', 0, 1, 0.01, 'pulse depth');
    R(glow, w, 'pulseSpeed', 0, 8, 0.05, 'pulse rate');
    R(glow, w, 'mottle', 0, 1, 0.01, '얼룩');
    R(glow, w, 'lift', 0, 0.2, 0.005, '바닥에서 띄움 (m)');

    /* ---- 2 · the shockwave ---- */
    const rings = folder.addFolder('2. 격발 충격파');
    const g = c.rings;
    rings.add(g, 'enabled').name('표시');
    rings.addColor(g, 'color').name('선단 색상');
    rings.addColor(g, 'coreColor').name('섬광 색상');
    rings.addColor(g, 'crackColor').name('균열 색상');
    rings.addColor(g, 'scorchColor').name('소멸 색상');
    R(rings, g, 'intensity', 0, 6, 0.05, '밝기');
    R(rings, g, 'radius', 0.5, 10, 0.1, '도달 (m)');
    R(rings, g, 'life', 0.2, 5, 0.05, '지속 (초)');
    R(rings, g, 'rings', 1, 6, 1, 'fronts in the train');
    R(rings, g, 'ringGap', 0.02, 0.4, 0.005, 'launched apart by (of life)');
    R(rings, g, 'cracks', 0, 40, 1, '균열 수');
    R(rings, g, 'crackLength', 0.1, 1, 0.01, 'crack length');
    R(rings, g, 'crackGlow', 0, 5, 0.05, 'crack heat');
    R(rings, g, 'scorch', 0, 1, 0.01, 'burn depth');
    R(rings, g, 'lift', 0, 0.2, 0.005, '바닥에서 띄움 (m)');

    /* ---- 3 · the column ---- */
    const column = folder.addFolder('3. 어두운 기둥');
    const p = c.column;
    column.addColor(p, 'color').name('몸 색상');
    column.addColor(p, 'coreColor').name('핵심 색상');
    column.addColor(p, 'shadeColor').name('그림자 색상');
    R(column, p, 'intensity', 0, 6, 0.01, '밝기');
    R(column, p, 'radius', 0.1, 3, 0.01, '구멍 직경 (m)');
    R(column, p, 'height', 1, 24, 0.1, 'stands (m)');
    R(column, p, 'shade', 0, 1, 0.01, 'edge darkening');
    R(column, p, 'corePower', 0.5, 12, 0.1, '핵심 집중도');
    R(column, p, 'rim', 0, 4, 0.01, '림');
    R(column, p, 'streaks', 0, 2, 0.01, 'striations');
    R(column, p, 'veins', 0, 6, 0.05, '번개');
    R(column, p, 'veinRate', 0, 24, 0.1, 'lightning rate');
    R(column, p, 'flare', 0, 4, 0.05, 'foot flare');
    R(column, p, 'arrivalWidth', 0, 2, 0.01, 'widens on arrival by');
    R(column, p, 'pinWidth', 0, 2, 0.01, 'widens on the impact by');
    R(column, p, 'severWidth', 0, 3, 0.01, 'bursts on the tear-out by');

    /* ---- 4 · the aura ---- */
    const wisps = folder.addFolder('4. 어두운 후광');
    const k = c.wisps;
    wisps.addColor(k, 'color').name('연기 색상');
    wisps.addColor(k, 'rimColor').name('프린지 색상');
    R(wisps, k, 'count', 0, 48, 1, 'wisps');
    R(wisps, k, 'opacity', 0, 1, 0.01, '불투명도');
    R(wisps, k, 'rim', 0, 4, 0.01, 'fringe');
    R(wisps, k, 'radius', 0.2, 6, 0.05, 'stand out (m)');
    R(wisps, k, 'height', 1, 14, 0.1, 'climb (m)');
    R(wisps, k, 'curl', 0, 3, 0.01, 'curl');
    R(wisps, k, 'writhe', -2, 2, 0.01, 'writhe');
    R(wisps, k, 'span', 0.1, 1, 0.01, 'length (of height)');
    R(wisps, k, 'speed', 0, 2, 0.01, 'climb rate');
    R(wisps, k, 'width', 0.02, 1.5, 0.01, '너비 (m)');
    R(wisps, k, 'erode', 0, 1.5, 0.01, 'raggedness');

    /* ---- 5 · the torn shadow ---- */
    const swirl = folder.addFolder('5. 그림자 소용돌이');
    const v = c.swirl;
    swirl.addColor(v, 'color').name('몸 색상');
    swirl.addColor(v, 'rimColor').name('프린지 색상');
    R(swirl, v, 'opacity', 0, 1, 0.01, '불투명도');
    R(swirl, v, 'rim', 0, 4, 0.01, 'fringe');
    R(swirl, v, 'rate', 0, 160, 1, 'puffs a second');
    R(swirl, v, 'gatherRate', 0, 80, 1, 'while gathering (a second)');
    R(swirl, v, 'impaleBurst', 0, 300, 1, 'thrown by the impact');
    R(swirl, v, 'severBurst', 0, 300, 1, 'thrown by the tear-out');
    R(swirl, v, 'spread', 0.1, 2, 0.01, 'born out at (of radius)');
    R(swirl, v, 'life', 0.2, 6, 0.05, '지속 (초)');
    R(swirl, v, 'spin', 0, 8, 0.05, '회전 속도 (rad/s)');
    R(swirl, v, 'rise', 0, 10, 0.05, 'lifts (m/s)');
    R(swirl, v, 'size', 0.05, 2, 0.01, '크기 (m)');
    R(swirl, v, 'stretch', 1, 6, 0.05, 'drawn along its orbit ×');
    R(swirl, v, 'erode', 0, 1.5, 0.01, 'raggedness');

    /* ---- 6 · the shatter ---- */
    const shards = folder.addFolder('6. 그림자 폭발');
    const d = c.shards;
    shards.add(d, 'enabled').name('표시');
    shards.addColor(d, 'color').name('면 색상');
    shards.addColor(d, 'rimColor').name('가장자리 색상');
    shards.addColor(d, 'coreColor').name('파단 색상');
    R(shards, d, 'opacity', 0, 1, 0.01, '불투명도');
    R(shards, d, 'rim', 0, 3, 0.01, 'edge fringe');
    R(shards, d, 'rimWidth', 0.01, 0.6, 0.005, '가장자리 너비');
    R(shards, d, 'heat', 0, 8, 0.05, 'fracture heat');
    R(shards, d, 'jagged', 0, 1.2, 0.01, 'corners wander by (rad)');
    R(shards, d, 'size', 0.02, 0.8, 0.005, '크기 (m)');
    R(shards, d, 'grow', 0, 3, 0.05, 'opens out by ×');
    R(shards, d, 'spin', 0, 12, 0.1, 'tumbles at (rad/s)');
    R(shards, d, 'speed', 0, 24, 0.1, '튐 속도 (m/s)');
    R(shards, d, 'life', 0.1, 4, 0.05, '지속 (초)');
    R(shards, d, 'drag', 0.05, 10, 0.05, '공기 저항');
    R(shards, d, 'gravity', -30, 0, 0.1, '낙하 (m/s²)');
    R(shards, d, 'rise', 0, 8, 0.05, '띄움 (m/s)');
    R(shards, d, 'spread', 0, 1.6, 0.01, 'thrust cone (rad)');
    R(shards, d, 'stabCount', 0, 80, 1, 'off one thrust');
    R(shards, d, 'impaleCount', 0, 200, 1, 'off the impact');
    R(shards, d, 'impaleStrength', 0, 3, 0.05, 'impact force ×');
    R(shards, d, 'severCount', 0, 250, 1, 'off the tear-out');
    R(shards, d, 'severStrength', 0, 4, 0.05, 'tear-out force ×');
    R(shards, d, 'severRadius', 0, 2, 0.01, 'tear-out born within (m)');

    /* ---- 7 · the embers ---- */
    const cinders = folder.addFolder('7. 입자 & 불씨');
    const n = c.cinders;
    cinders.add(n, 'enabled').name('표시');
    cinders.addColor(n, 'color').name('불씨 색상');
    cinders.addColor(n, 'coreColor').name('핵심 색상');
    R(cinders, n, 'intensity', 0, 6, 0.05, '밝기');
    R(cinders, n, 'speed', 0, 24, 0.1, '튐 속도 (m/s)');
    R(cinders, n, 'life', 0.1, 4, 0.05, '지속 (초)');
    R(cinders, n, 'drag', 0.05, 10, 0.05, '공기 저항');
    R(cinders, n, 'gravity', -30, 0, 0.1, '낙하 (m/s²)');
    R(cinders, n, 'rise', 0, 8, 0.05, '띄움 (m/s)');
    R(cinders, n, 'size', 0.002, 0.1, 0.001, '크기 (m)');
    R(cinders, n, 'stretch', 0, 8, 0.05, 'stretch by speed');
    R(cinders, n, 'halo', 0, 2, 0.01, '광배');
    R(cinders, n, 'stabCount', 0, 80, 1, 'off one thrust');
    R(cinders, n, 'severCount', 0, 250, 1, 'off the tear-out');
    R(cinders, n, 'drift', 0, 120, 1, 'drift (a second)');
    R(cinders, n, 'driftSpread', 0, 2, 0.01, 'drift spread (of radius)');

    /* ---- 8 · the crescents ---- */
    const trails = folder.addFolder('8. Slash trails');
    const t = c.trails;
    trails.add(t, 'enabled').name('표시');
    trails.addColor(t, 'coreColor').name('날 색상');
    trails.addColor(t, 'color').name('몸 색상');
    trails.addColor(t, 'edgeColor').name('꼬리 색상');
    R(trails, t, 'intensity', 0, 8, 0.05, '밝기');
    R(trails, t, 'razor', 0, 1, 0.01, 'razor sits at');
    R(trails, t, 'razorWidth', 0.01, 0.5, 0.005, 'razor width');
    R(trails, t, 'core', 0, 5, 0.05, 'razor heat');
    R(trails, t, 'falloff', 0.2, 6, 0.05, 'body falloff');
    R(trails, t, 'tip', 0.05, 2, 0.01, '끝 날카로움');
    R(trails, t, 'draw', 0.01, 0.9, 0.01, 'swept over (of life)');
    R(trails, t, 'headFlare', 0, 6, 0.05, 'head heat');
    R(trails, t, 'detail', 0.2, 12, 0.1, 'tear detail');
    R(trails, t, 'tear', 0, 3, 0.01, 'tears apart by');
    R(trails, t, 'hair', 2, 80, 0.5, 'filaments');

    // One look, three gestures. The orbit's is dragged behind a blade that is
    // travelling; the thrust's is a nearly straight streak; the tear-out's is
    // most of a circle.
    for (const [key, title] of [
      ['orbitArc', '8a. Dragged by the ring'],
      ['stabArc', "8b. The thrust's stroke"],
      ['severArc', "8c. The tear-out's strokes"]
    ]) {
      const arc = folder.addFolder(title);
      const a = c[key];
      R(arc, a, 'count', 0, 8, 1, 'strokes');
      R(arc, a, 'spread', 0, 2, 0.01, 'fan opens by (rad)');
      R(arc, a, 'radius', 0.2, 6, 0.05, '호 반경 (m)');
      R(arc, a, 'sweep', 0.1, 5, 0.05, 'arc spans (rad)');
      R(arc, a, 'width', 0.02, 1.5, 0.01, 'width (of radius)');
      R(arc, a, 'life', 0.05, 2, 0.01, '지속 (초)');
      R(arc, a, 'pitch', 0, 3, 0.05, 'sheared forward by');
      R(arc, a, 'strength', 0, 3, 0.05, 'master ×');
      // Only the dragged one has a rate: the other two are struck by an event.
      if ('rate' in a) R(arc, a, 'rate', 0, 40, 0.5, 'struck (a second)');
    }

    /* ---- 9 · the katanas ---- */
    const blades = folder.addFolder('9. Floating katanas');
    const b = c.blades;
    blades.add(b, 'enabled').name('표시');
    R(blades, b, 'count', 1, 6, 1, 'how many come');
    R(blades, b, 'length', 0.3, 3, 0.01, 'blade length (m)');
    blades.add(b, 'flip').name('끝점이 반대쪽');
    R(blades, b, 'standoff', 0.5, 6, 0.05, 'ring radius (m)');
    R(blades, b, 'bite', 0, 1.5, 0.01, 'thrust ends at (m)');
    R(blades, b, 'spreadHeight', 0, 1.5, 0.01, 'heights apart (m)');
    R(blades, b, 'orbit', 0, 8, 0.05, 'ring turns at (rad/s)');
    R(blades, b, 'gatherSpin', 0, 4, 0.05, 'drifts at ×');
    R(blades, b, 'windSpin', 0, 12, 0.1, 'winds up to ×');
    R(blades, b, 'tighten', 0.15, 1, 0.01, 'closes to (of radius)');
    R(blades, b, 'stagger', 0, 0.6, 0.01, 'arrive apart by (s)');
    R(blades, b, 'gatherDrift', 0, 3, 0.05, 'gathers from (m)');
    R(blades, b, 'hover', 0, 0.4, 0.005, 'hover (m)');
    R(blades, b, 'spin', 0, 8, 0.05, 'rolls at (rad/s)');
    R(blades, b, 'quiver', 0, 0.3, 0.005, 'rings by (m)');
    R(blades, b, 'throughDistance', 0.5, 8, 0.1, 'leaves to (m)');
    R(blades, b, 'throughLift', 0, 5, 0.05, 'leaves rising (m)');
    R(blades, b, 'throughArc', 0, 3, 0.05, 'leaves curving by (m)');
    R(blades, b.beats, 'gather', 0.05, 1.5, 0.01, 'resolves over (s)');
    R(blades, b.beats, 'thrust', 0.02, 0.6, 0.01, 'thrust takes (s)');
    R(blades, b.beats, 'wrench', 0.05, 2, 0.01, 'tear-out takes (s)');
    blades.addColor(b, 'bodyColor').name('강철 색상');
    blades.addColor(b, 'sheenColor').name('광택 색상');
    blades.addColor(b, 'rimColor').name('림 색상');
    R(blades, b, 'rim', 0, 6, 0.05, '림');
    blades.addColor(b, 'edgeColor').name('소멸 선');
    R(blades, b, 'edgeEmissive', 0, 24, 0.1, 'burn line heat');
    R(blades, b, 'edgeWidth', 0.005, 0.6, 0.005, 'burn line width');
    R(blades, b, 'burnRise', 0, 1, 0.01, 'arrives point-first by');
    R(blades, b, 'veins', 0, 2, 0.01, 'energy in the steel');

    /* ---- the light, and the body it leaves behind ---- */
    const light = folder.addFolder('빛 자체');
    const l = c.light;
    light.addColor(l, 'color').name('색상');
    R(light, l, 'intensity', 0, 80, 0.5, '밝기');
    R(light, l, 'range', 1, 40, 0.5, '도달 (m)');
    R(light, l, 'decay', 0, 4, 0.05, 'falloff exponent');
    R(light, l, 'fall', 0.05, 2, 0.01, 'a flash falls over (s)');
    R(light, l, 'hold', 0, 1, 0.01, 'standing glow ×');
    R(light, l, 'mark', 0, 1, 0.01, 'mark flash ×');
    R(light, l, 'impale', 0, 1, 0.01, 'impact flash ×');
    R(light, l, 'sever', 0, 1, 0.01, 'tear-out flash ×');

    const burn = folder.addFolder('신체가 사라지는 방식');
    const u = c.unmake;
    R(burn, u, 'corpseTime', 0, 6, 0.05, 'lies there (s)');
    R(burn, u, 'dissolveTime', 0.1, 6, 0.05, 'comes apart over (s)');
    burn.addColor(u, 'edgeColor').name('소멸 선');
    R(burn, u, 'edgeEmissive', 0, 24, 0.1, 'burn line heat');
    R(burn, u, 'edgeWidth', 0.01, 0.6, 0.005, 'burn line width');
    R(burn, u, 'dissolveRise', 0, 1, 0.01, 'burns bottom-up by');
  }

  /**
   * The circle under a body in reach — see `vfx/TargetRings.js`.
   *
   * There is nothing here about *who* wears one: that is the two moves' own
   * lock range and cone above, and this only draws the answer. `falloff` is the
   * one to reach for — it is the exponent on the radius, so low is a glow that
   * fills the circle and high is a hard rim with nothing inside it.
   */
  _buildTargetRing(parent) {
    const folder = parent.addFolder('타깃 링');
    const R = Editor.range;
    const t = settings.targetRing;

    folder.add(t, 'enabled').name('켜기');
    folder.addColor(t, 'color').name('색상');
    R(folder, t, 'radius', 0.2, 3, 0.01, '반경 (m)');
    R(folder, t, 'falloff', 0.2, 12, 0.1, '가장자리 감쇠');
    R(folder, t, 'softness', 0.01, 0.6, 0.01, 'outer feather');
    R(folder, t, 'intensity', 0, 6, 0.05, '밝기');
    R(folder, t, 'pulse', 0, 1, 0.01, '호흡 깊이');
    R(folder, t, 'pulseSpeed', 0, 12, 0.1, '호흡 속도');
    R(folder, t, 'lift', 0, 0.2, 0.005, '바닥에서 띄움 (m)');
    R(folder, t, 'fadeIn', 0.01, 1, 0.01, 'fade in (s)');
    R(folder, t, 'fadeOut', 0.01, 1, 0.01, 'fade out (s)');
  }

  /**
   * The cut, the meat and the blood — see `combat/Enemy.js`.
   *
   * Everything here is live *except* the plane itself: `height` and `tilt` are
   * read once, at the moment of the blow, because a plane that moved afterwards
   * would slide up a corpse already lying in two pieces. Cut something new to
   * see those two move. Colours, the meat and the blood are all per-frame.
   *
   * The two multiplier groups are the ones worth playing with: `upper` is what
   * the top half takes of the move's own impulse, lift and spin, and `lower` is
   * what is left for a pair of legs. Give the lower half much of anything and
   * the body stops reading as cut and starts reading as two bodies that were
   * standing very close together.
   */
  _buildSlice(parent) {
    const folder = parent.addFolder('절단 & 피');
    const R = Editor.range;
    const s = settings.slice;

    folder.add(s, 'enabled').name('절단 켜기');

    const plane = folder.addFolder('절단면 (타격 순간 확인)');
    R(plane, s, 'height', 0.1, 0.9, 0.01, 'cuts at (× height)');
    R(plane, s, 'tilt', 0, 60, 1, 'tilt off level (°)');
    R(plane, s, 'separation', 0, 0.6, 0.01, 'halves part by (m)');
    R(plane, s, 'split', 0, 8, 0.05, 'driven apart at (m/s)');

    const halves = folder.addFolder('각각의 토막이 가지는 것');
    R(halves, s.upper, 'impulse', 0, 3, 0.05, 'top: force ×');
    R(halves, s.upper, '띄움', 0, 3, 0.05, 'top: lift ×');
    R(halves, s.upper, 'spin', 0, 3, 0.05, 'top: spin ×');
    R(halves, s.lower, 'impulse', 0, 2, 0.01, 'legs: force ×');
    R(halves, s.lower, '띄움', 0, 2, 0.01, 'legs: lift ×');
    R(halves, s.lower, 'spin', 0, 2, 0.01, 'legs: spin ×');

    // Turn this off and the torso falls through the legs, which is the clearest
    // way to see what it is doing.
    const hit = folder.addFolder('두 토막 사이');
    const c = s.collide;
    hit.add(c, 'enabled').name('두 토막 충돌');
    R(hit, c, 'radius', 0, 0.3, 0.005, 'joint size (m)');
    R(hit, c, 'bounce', 0, 1, 0.01, '반발');
    R(hit, c, 'friction', 0, 1, 0.01, 'grip');
    R(hit, c, 'maxPush', 0.005, 0.3, 0.005, 'push cap /frame (m)');

    // The hollow the cut opens is the material's own back faces, painted as
    // meat — there is no cap geometry anywhere in this.
    const meat = folder.addFolder('상처');
    meat.addColor(s, 'interiorColor').name('안쪽 색상');
    R(meat, s, 'interiorEmissive', 0, 3, 0.01, 'inside glow');
    meat.addColor(s, 'edgeColor').name('절단선 색상');
    R(meat, s, 'edgeEmissive', 0, 20, 0.1, 'cut line glow');
    R(meat, s, 'edgeWidth', 0.001, 0.08, 0.001, 'cut line width');

    const blood = folder.addFolder('피');
    const b = s.blood;
    blood.add(b, 'enabled').name('피 켜기');
    blood.addColor(b, 'color').name('피 색상');
    R(blood, b, 'brightness', 0, 4, 0.05, '밝기');
    R(blood, b, 'burst', 0, 600, 5, 'droplets on the cut');
    R(blood, b, 'speed', 0, 15, 0.1, '튐 속도 (m/s)');
    R(blood, b, 'spread', 0, 2, 0.01, 'spray spread');
    R(blood, b, 'drip', 0, 300, 1, 'stump drip (/s)');
    R(blood, b, 'dripSpeed', 0, 6, 0.05, 'drip speed (m/s)');
    R(blood, b, 'bleedTime', 0, 8, 0.1, 'bleeds for (s)');
    R(blood, b, 'size', 0.002, 0.15, 0.002, 'droplet size (m)');
    R(blood, b, 'sizeVariance', 0, 1, 0.01, 'size variance');
    R(blood, b, 'life', 0.1, 5, 0.05, 'droplet life (s)');
    R(blood, b, 'lifeVariance', 0, 0.95, 0.01, 'life variance');
    R(blood, b, 'gravity', -60, 0, 0.5, '중력 (m/s²)');
    R(blood, b, 'drag', 0.02, 4, 0.01, '공기 저항 /s');
    R(blood, b, 'stretch', 0, 0.4, 0.005, 'motion streak');
    R(blood, b, 'maxStretch', 1, 20, 0.5, 'streak ceiling');
    R(blood, b, 'fade', 0.02, 1, 0.01, 'fades over (× life)');
  }

  /**
   * The character screen's set.
   *
   * Same contract as everything above — `StudioStage` re-resolves the whole rig
   * from these fields every frame, so a slider moved with the screen open
   * re-lights it on the next one. The screen has to be up (`Tab`) to see any of
   * it; the play stage next door reads none of these.
   */
  _buildStudio() {
    const folder = this.gui.addFolder('캐릭터실');
    const s = settings.studio;
    const R = Editor.range;

    R(folder, s, 'turntable', -0.3, 0.3, 0.005, '회전 속도 (rev/s)').listen();

    const camera = folder.addFolder('카메라');
    R(camera, s.camera, 'fov', 15, 80, 0.5, '시야각');
    R(camera, s.camera, 'targetHeight', 0, 2.2, 0.01, 'look at (m)');
    R(camera, s.camera, 'minDistance', 0.2, 3, 0.05, '최소 거리');
    R(camera, s.camera, 'maxDistance', 1, 20, 0.1, '최대 거리');
    R(camera, s.camera, 'autoOrbit', -0.2, 0.2, 0.005, 'camera drift (rev/s)');

    // Key and fill are each a spot plus a softbox at the same angle; moving the
    // angle moves both, which is what keeps them reading as one source.
    const key = folder.addFolder('키 라이트');
    const l = s.lights;
    R(key, l, 'keyIntensity', 0, 400, 1, 'spot (cd)');
    key.addColor(l, 'keyColor').name('색상');
    R(key, l, 'keyAzimuth', 0, Math.PI * 2, 0.01, 'azimuth');
    R(key, l, 'keyElevation', 0.05, 1.5, 0.01, '고도');
    R(key, l, 'keyDistance', 1, 10, 0.05, '거리 (m)');
    R(key, l, 'keyAngle', 0.1, 1.4, 0.01, 'cone');
    R(key, l, 'keyPenumbra', 0, 1, 0.01, 'penumbra');
    R(key, l, 'keySoftbox', 0, 20, 0.1, 'softbox (nits)');
    R(key, l, 'keySoftboxSize', 0.2, 8, 0.1, 'softbox size (m)');

    const fill = folder.addFolder('보조광');
    R(fill, l, 'fillIntensity', 0, 12, 0.05, 'intensity (nits)');
    fill.addColor(l, 'fillColor').name('색상');
    R(fill, l, 'fillAzimuth', 0, Math.PI * 2, 0.01, 'azimuth');
    R(fill, l, 'fillElevation', 0.05, 1.5, 0.01, '고도');
    R(fill, l, 'fillDistance', 1, 10, 0.05, '거리 (m)');
    R(fill, l, 'fillSize', 0.2, 8, 0.1, 'panel size (m)');

    const edges = folder.addFolder('림, 키커, 머리광');
    R(edges, l, 'rimIntensity', 0, 600, 1, 'rim (cd)');
    edges.addColor(l, 'rimColor').name('림 색상');
    R(edges, l, 'rimAzimuth', 0, Math.PI * 2, 0.01, '림 라이트 방위각');
    R(edges, l, 'rimElevation', 0.05, 1.5, 0.01, '림 라이트 고도');
    R(edges, l, 'rimDistance', 1, 10, 0.05, 'rim distance (m)');
    R(edges, l, 'kickerIntensity', 0, 400, 1, 'kicker (cd)');
    edges.addColor(l, 'kickerColor').name('키커 색상');
    R(edges, l, 'kickerAzimuth', 0, Math.PI * 2, 0.01, 'kicker azimuth');
    R(edges, l, 'kickerElevation', 0.05, 1.5, 0.01, 'kicker elevation');
    R(edges, l, 'kickerDistance', 1, 10, 0.05, 'kicker distance (m)');
    R(edges, l, 'topIntensity', 0, 300, 1, 'hair light (cd)');
    edges.addColor(l, 'topColor').name('머리카락 색상');

    const ambient = folder.addFolder('환경광 & 그림자');
    R(ambient, l, 'ambientIntensity', 0, 1, 0.005, '환경광');
    ambient.addColor(l, 'ambientColor').name('환경광 색상');
    R(ambient, l, 'envIntensity', 0, 3, 0.01, '환경맵(IBL)');
    R(ambient, l, 'shadowRadius', 0, 12, 0.1, '그림자 부드러움');
    R(ambient, l, 'shadowBias', -0.01, 0.001, 0.0001, '그림자 바이어스');
    R(ambient, l, 'shadowNormalBias', 0, 0.1, 0.001, 'normal bias');

    const stage = folder.addFolder('세트');
    const st = s.stage;
    stage.addColor(st, 'backdropTop').name('배경 상단');
    stage.addColor(st, 'backdropBottom').name('배경 하단');
    stage.addColor(st, 'backdropGlow').name('광배 색상');
    R(stage, st, 'glowStrength', 0, 3, 0.01, 'halo strength');
    R(stage, st, 'glowSpread', 0, 1, 0.01, 'halo spread');
    stage.addColor(st, 'floorColor').name('바닥 색상');
    R(stage, st, 'floorRoughness', 0.02, 1, 0.01, 'floor roughness');
    R(stage, st, 'floorMetalness', 0, 1, 0.01, 'floor metalness');
    R(stage, st, 'floorRadius', 1, 8, 0.05, 'plinth radius (m)');
    stage.addColor(st, 'ringColor').name('고리 색상');
    R(stage, st, 'ringIntensity', 0, 6, 0.01, 'ring intensity');
    R(stage, st, 'contactShadow', 0, 2, 0.01, '접촉 그림자');
    R(stage, st, 'dust', 0, 3, 0.01, 'studio haze');

    const post = folder.addFolder('색보정');
    const p = s.post;
    post.add(p, 'enabled').name('켜기');
    R(post, p, 'exposure', 0.1, 3, 0.01, '노출');
    R(post, p, 'bloomStrength', 0, 3, 0.01, '블룸 강도');
    R(post, p, 'bloomRadius', 0, 1.5, 0.01, '블룸 반경');
    R(post, p, 'bloomThreshold', 0, 2, 0.01, '블룸 임계값');
    R(post, p, 'contrast', 0.5, 2, 0.01, '대비');
    R(post, p, 'saturation', 0, 2.5, 0.01, '채도');
    R(post, p, 'temperature', -0.5, 0.5, 0.01, '색온도');
    R(post, p, 'vignette', 0, 1.5, 0.01, '비네트');
    R(post, p, 'chromaticAberration', 0, 3, 0.01, '색수차');
    R(post, p, 'grain', 0, 0.2, 0.001, '필름 그레인');
  }

  dispose() {
    this.gui.destroy();
  }
}
