/* eslint-disable unicorn/filename-case -- Public integration filename is specified by the host. */
import { REFINE_CHANCES } from '../systems/refine-system';

import { AUTO_RECYCLE_RARITIES } from '@kaetram/common/network/impl/autohunt';

import type {
    AutoRecycleRarity,
    CombatStance,
    GambitAction,
    GambitCondition,
    GambitRule
} from '../../packages/common/network/impl/autohunt';

export type ClassicHUDDock = 'left' | 'right' | 'bottom';
export type ClassicHUDRarity = AutoRecycleRarity;
export type ClassicHUDOperation = 'forge' | 'refine' | 'repair';

/**
 * An adapter-friendly equipment view, not an EquipmentInstance. Populate only fields
 * supplied by the server; identifiers must uniquely identify an equipment instance.
 */
export interface ClassicHUDEquipment {
    id: string;
    name: string;
    slot?: string;
    cards?: readonly string[];
    gems?: readonly string[];
    refineLevel?: number;
    isScarred?: boolean;
    /** Server quote for forge only; chance is a fraction from 0 to 1. */
    forgeQuote?: {
        successChance?: number;
        materials?: readonly { key: string; count: number }[];
    };
    operations?: { [key in ClassicHUDOperation]?: { available: boolean; reason?: string } };
}

export interface ClassicHUDState {
    equipment?: readonly ClassicHUDEquipment[];
    stance?: CombatStance;
    gambits?: readonly GambitRule[];
    autoRecycle?: { rarities: readonly ClassicHUDRarity[] };
}

/** Callbacks request server changes. The HUD never assumes that a request succeeded. */
export interface ClassicHUDCallbacks {
    onStanceChange?(stance: CombatStance): void;
    onGambitsChange?(rules: GambitRule[]): void;
    onAutoRecycleChange?(settings: { rarities: ClassicHUDRarity[] }): void;
    onEquipmentOperation?(operation: ClassicHUDOperation, equipmentId: string): void;
}

export interface ClassicHUDOptions {
    state?: ClassicHUDState;
    callbacks?: ClassicHUDCallbacks;
    dock?: ClassicHUDDock;
}

type RuleDraft = {
    id: string;
    enabled: boolean;
    condition: GambitCondition['type'] | '';
    percent: string;
    count: string;
    action: GambitAction['type'] | '';
    stance: CombatStance | '';
};

const stances: CombatStance[] = ['Equilíbrio', 'Avanço', 'Guarda'],
    rarities: ClassicHUDRarity[] = [...AUTO_RECYCLE_RARITIES],
    operations: ClassicHUDOperation[] = ['forge', 'refine', 'repair'],
    conditionOptions: Array<[GambitCondition['type'], string]> = [
        ['HP_BELOW_PERCENT', 'HP below %'],
        ['TARGET_IS_PORTADOR_OR_BOSS', 'Target is Portador or boss'],
        ['ADJACENT_ENEMIES_GTE', 'Adjacent enemies at least'],
        ['ALWAYS', 'Always']
    ],
    actionOptions: Array<[GambitAction['type'], string]> = [
        ['USE_POTION_OR_HEAL', 'Use potion or heal'],
        ['SWITCH_STANCE', 'Switch stance'],
        ['USE_ULTIMATE', 'Use ultimate'],
        ['USE_AOE', 'Use area attack'],
        ['ATTACK_NEAREST', 'Attack nearest']
    ];

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string
): HTMLElementTagNameMap[K] {
    let node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function button(text: string, handler: () => void): HTMLButtonElement {
    let node = element('button', text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
    let node = element('label', undefined, 'classic-hud__field');
    node.append(element('span', label), control);
    return node;
}

function select<T extends string>(
    value: T | '',
    options: ReadonlyArray<readonly [T, string]>,
    placeholder: string
): HTMLSelectElement {
    let node = element('select'),
        empty = element('option', placeholder);
    empty.value = '';
    node.append(empty);
    for (let [key, label] of options) {
        let option = element('option', label);
        option.value = key;
        node.append(option);
    }
    node.value = value;
    return node;
}

function draftFromRule(rule: GambitRule): RuleDraft {
    return {
        id: rule.id,
        enabled: rule.enabled !== false,
        condition: rule.condition.type,
        percent: rule.condition.type === 'HP_BELOW_PERCENT' ? String(rule.condition.percent) : '',
        count: rule.condition.type === 'ADJACENT_ENEMIES_GTE' ? String(rule.condition.count) : '',
        action: rule.action.type,
        stance: rule.action.type === 'SWITCH_STANCE' ? rule.action.stance : ''
    };
}

function toRule(draft: RuleDraft): GambitRule | undefined {
    let condition: GambitCondition;
    switch (draft.condition) {
        case 'HP_BELOW_PERCENT': {
            let percent = Number(draft.percent);
            if (!draft.percent.trim() || !Number.isFinite(percent) || percent <= 0 || percent > 100)
                return;
            condition = { type: draft.condition, percent };
            break;
        }
        case 'ADJACENT_ENEMIES_GTE': {
            let count = Number(draft.count);
            if (!draft.count.trim() || !Number.isSafeInteger(count) || count < 1) return;
            condition = { type: draft.condition, count };
            break;
        }
        case 'TARGET_IS_PORTADOR_OR_BOSS':
        case 'ALWAYS': {
            condition = { type: draft.condition };
            break;
        }
        default: {
            return;
        }
    }

    let action: GambitAction;
    switch (draft.action) {
        case 'SWITCH_STANCE': {
            if (!draft.stance) return;
            action = { type: draft.action, stance: draft.stance };
            break;
        }
        case 'USE_POTION_OR_HEAL':
        case 'USE_ULTIMATE':
        case 'USE_AOE':
        case 'ATTACK_NEAREST': {
            action = { type: draft.action };
            break;
        }
        default: {
            return;
        }
    }
    let id = draft.id.trim();
    if (!id || id.length > 64) return;
    return { id, enabled: draft.enabled, condition, action };
}

/**
 * Mount with `new ClassicHUD(container, options)`, import the SCSS in the host,
 * call update() with authoritative snapshots, and destroy() on unmount.
 * update() replaces the snapshot and resets drafts only when their server state changes.
 */
export class ClassicHUD {
    private readonly root = element('aside', undefined, 'classic-hud');
    private readonly body = element('div', undefined, 'classic-hud__panels');
    // eslint-disable-next-line unicorn/consistent-function-scoping
    private readonly collapse = button('Collapse HUD', () => this.setCollapsed(!this.collapsed));
    private readonly callbacks: ClassicHUDCallbacks;
    private state: ClassicHUDState;
    private drafts: RuleDraft[] = [];
    private recycle: ClassicHUDRarity[] = [];
    private selectedEquipment = '';
    private collapsed = false;
    private dock: ClassicHUDDock;
    private gambitContent = element('div');
    private equipmentContent = element('div');
    private stanceContent = element('div');
    private recycleContent = element('div');

    public constructor(container: HTMLElement, options: ClassicHUDOptions = {}) {
        this.callbacks = options.callbacks ?? {};
        this.state = {};
        this.dock = options.dock ?? 'right';
        this.root.setAttribute('aria-label', 'Classic HUD');
        this.root.addEventListener('keydown', (event) => event.stopPropagation());
        let toolbar = element('div', undefined, 'classic-hud__toolbar'),
            dock = select<ClassicHUDDock>(
                this.dock,
                [
                    ['left', 'Left'],
                    ['right', 'Right'],
                    ['bottom', 'Bottom']
                ],
                'Choose dock'
            );
        dock.addEventListener('change', () => {
            if (dock.value === 'left' || dock.value === 'right' || dock.value === 'bottom')
                this.setDock(dock.value);
        });
        this.collapse.setAttribute('aria-expanded', 'true');
        toolbar.append(this.collapse, field('Dock', dock));
        this.body.append(
            this.panel('Equipment & workshop', this.equipmentContent),
            this.panel('Stance', this.stanceContent),
            this.panel('Gambits', this.gambitContent),
            this.panel('Auto-recycle', this.recycleContent)
        );
        this.root.append(toolbar, this.body);
        container.append(this.root);
        this.setDock(this.dock);
        this.renderEquipment();
        this.renderStance();
        this.renderGambits();
        this.renderRecycle();
        this.update(options.state ?? {});
    }

    public update(state: ClassicHUDState): void {
        let gambitsChanged = JSON.stringify(this.state.gambits) !== JSON.stringify(state.gambits),
            recycleChanged =
                JSON.stringify(this.state.autoRecycle) !== JSON.stringify(state.autoRecycle),
            equipmentChanged =
                JSON.stringify(this.state.equipment) !== JSON.stringify(state.equipment),
            stanceChanged = this.state.stance !== state.stance;
        this.state = state;
        if (gambitsChanged)
            this.drafts = (state.gambits ?? []).slice(0, 5).map((rule) => draftFromRule(rule));
        if (recycleChanged) this.recycle = [...(state.autoRecycle?.rarities ?? [])];
        if (!state.equipment?.some((item) => item.id === this.selectedEquipment))
            this.selectedEquipment = '';
        if (equipmentChanged) this.renderEquipment();
        if (stanceChanged) this.renderStance();
        if (gambitsChanged) this.renderGambits();
        if (recycleChanged) this.renderRecycle();
    }

    public setDock(dock: ClassicHUDDock): void {
        this.dock = dock;
        this.root.dataset.dock = dock;
        let control = this.root.querySelector<HTMLSelectElement>('.classic-hud__toolbar select');
        if (control) control.value = dock;
    }

    public setCollapsed(collapsed: boolean): void {
        this.collapsed = collapsed;
        this.body.hidden = collapsed;
        this.collapse.textContent = collapsed ? 'Expand HUD' : 'Collapse HUD';
        this.collapse.setAttribute('aria-expanded', String(!collapsed));
    }

    public destroy(): void {
        this.root.remove();
    }

    private panel(title: string, content: HTMLElement): HTMLElement {
        let details = element('details', undefined, 'classic-hud__panel');
        details.append(element('summary', title), content);
        return details;
    }

    private renderEquipment(): void {
        let content = this.equipmentContent;
        content.replaceChildren();
        let { equipment } = this.state;
        if (!equipment) {
            content.append(element('p', 'Equipment state unavailable.'));
            return;
        }
        if (equipment.length === 0) {
            content.append(element('p', 'No equipment supplied.'));
            return;
        }
        let picker = select(
            this.selectedEquipment,
            equipment.map((item) => [
                item.id,
                item.slot ? `${item.slot}: ${item.name}` : item.name
            ]),
            'Select equipment'
        );
        picker.addEventListener('change', () => {
            this.selectedEquipment = picker.value;
            this.renderEquipment();
            this.equipmentContent.querySelector('select')?.focus();
        });
        content.append(field('Equipment', picker));
        let item = equipment.find((candidate) => candidate.id === this.selectedEquipment);
        if (!item) return;

        let list = element('dl', undefined, 'classic-hud__equipment'),
            row = (name: string, value: string): void => {
                list.append(element('dt', name), element('dd', value));
            };
        row('Cards', item.cards === undefined ? 'Unavailable' : item.cards.join(', ') || 'None');
        row('Gems', item.gems === undefined ? 'Unavailable' : item.gems.join(', ') || 'None');
        row('Refine', item.refineLevel === undefined ? 'Unavailable' : `+${item.refineLevel}`);
        row('Scar', item.isScarred === undefined ? 'Unavailable' : item.isScarred ? 'Yes' : 'No');
        let level = item.refineLevel,
            target =
                level !== undefined && Number.isInteger(level) && level >= 0
                    ? level + 1
                    : undefined,
            chance = target === undefined ? undefined : REFINE_CHANCES[target],
            forgeChance = item.forgeQuote?.successChance,
            forgeMaterials = item.forgeQuote?.materials;
        row(
            'Next refinement',
            target === undefined
                ? 'Refine level unavailable'
                : chance === undefined
                ? 'No next level defined'
                : `+${target}: ${chance * 100}% base success`
        );
        if (chance !== undefined && target !== undefined) {
            row('Refine materials', `1 aurora_jewel, ${target} temper_fragments`);
            if (item.isScarred === true)
                row('Refine rule', 'Scarred equipment must be repaired before refinement.');
            else if (item.isScarred === undefined)
                row('Refine rule', 'Scar state unavailable; success rate is the base rate.');
        }
        row('Repair materials', '1 purified_relic');
        row(
            'Forge success',
            forgeChance === undefined ||
                !Number.isFinite(forgeChance) ||
                forgeChance < 0 ||
                forgeChance > 1
                ? 'Not supplied'
                : `${forgeChance * 100}%`
        );
        row(
            'Forge materials',
            forgeMaterials === undefined
                ? 'Not supplied'
                : forgeMaterials
                      .map((material) => `${material.count} ${material.key}`)
                      .join(', ') || 'None'
        );
        content.append(list);
        let actions = element('div', undefined, 'classic-hud__actions'),
            equipmentId = item.id;
        for (let operation of operations) {
            let capability = item.operations?.[operation],
                action = button(
                    operation,
                    () => this.callbacks.onEquipmentOperation?.(operation, equipmentId)
                );
            action.disabled = !capability?.available || !this.callbacks.onEquipmentOperation;
            if (capability?.reason) {
                action.title = capability.reason;
                actions.append(action, element('span', `${operation}: ${capability.reason}`));
            } else actions.append(action);
        }
        content.append(actions);
    }

    private renderStance(): void {
        let content = this.stanceContent;
        content.replaceChildren();
        if (!this.state.stance) {
            content.append(element('p', 'Stance state unavailable.'));
            return;
        }
        let control = select(
            this.state.stance,
            stances.map((stance) => [stance, stance]),
            'Choose stance'
        );
        control.disabled = !this.callbacks.onStanceChange;
        control.addEventListener('change', () => {
            let stance = stances.find((value) => value === control.value);
            control.value = this.state.stance ?? '';
            if (stance) this.callbacks.onStanceChange?.(stance);
        });
        content.append(field('Auto-hunt stance', control));
    }

    private renderGambits(focus?: { index: number; control: string }): void {
        let content = this.gambitContent;
        content.replaceChildren();
        if (!this.state.gambits) {
            content.append(element('p', 'Gambit state unavailable.'));
            return;
        }
        if (this.state.gambits.length > 5) {
            content.append(element('p', 'Too many server rules to edit safely.'));
            return;
        }
        let form = element('form');
        form.append(element('p', 'Highest priority first. Changes are sent only when saved.'));
        for (let [index, draft] of this.drafts.entries()) {
            let group = element('fieldset', undefined, 'classic-hud__rule');
            group.append(element('legend', `Priority ${index + 1}`));
            let enabled = element('input');
            enabled.type = 'checkbox';
            enabled.checked = draft.enabled;
            enabled.addEventListener('change', () => (draft.enabled = enabled.checked));
            group.append(field('Enabled', enabled));
            let id = element('input');
            id.value = draft.id;
            id.maxLength = 64;
            id.required = true;
            id.addEventListener('input', () => (draft.id = id.value));
            group.append(field('Rule ID', id));
            let condition = select(draft.condition, conditionOptions, 'Choose condition');
            condition.required = true;
            condition.dataset.control = 'condition';
            condition.addEventListener('change', () => {
                draft.condition =
                    conditionOptions.find(([value]) => value === condition.value)?.[0] ?? '';
                this.renderGambits({ index, control: 'condition' });
            });
            group.append(field('Condition', condition));
            if (
                draft.condition === 'HP_BELOW_PERCENT' ||
                draft.condition === 'ADJACENT_ENEMIES_GTE'
            ) {
                let numeric = element('input'),
                    isPercent = draft.condition === 'HP_BELOW_PERCENT';
                numeric.type = 'number';
                numeric.required = true;
                numeric.min = isPercent ? '0.01' : '1';
                numeric.step = isPercent ? 'any' : '1';
                if (isPercent) numeric.max = '100';
                numeric.value = isPercent ? draft.percent : draft.count;
                numeric.addEventListener('input', () => {
                    if (isPercent) draft.percent = numeric.value;
                    else draft.count = numeric.value;
                });
                group.append(field(isPercent ? 'HP percent' : 'Enemy count', numeric));
            }
            let action = select(draft.action, actionOptions, 'Choose action');
            action.required = true;
            action.dataset.control = 'action';
            action.addEventListener('change', () => {
                draft.action = actionOptions.find(([value]) => value === action.value)?.[0] ?? '';
                this.renderGambits({ index, control: 'action' });
            });
            group.append(field('Action', action));
            if (draft.action === 'SWITCH_STANCE') {
                let stance = select(
                    draft.stance,
                    stances.map((value) => [value, value]),
                    'Choose stance'
                );
                stance.required = true;
                stance.addEventListener('change', () => {
                    draft.stance = stances.find((value) => value === stance.value) ?? '';
                });
                group.append(field('Stance', stance));
            }
            let actions = element('div', undefined, 'classic-hud__actions'),
                move = (offset: number): void => {
                    let target = index + offset;
                    [this.drafts[index], this.drafts[target]] = [
                        this.drafts[target]!,
                        this.drafts[index]!
                    ];
                    this.renderGambits({ index: target, control: offset < 0 ? 'up' : 'down' });
                },
                up = button('Move up', () => move(-1));
            up.dataset.control = 'up';
            up.disabled = index === 0;
            let down = button('Move down', () => move(1));
            down.dataset.control = 'down';
            down.disabled = index === this.drafts.length - 1;
            actions.append(
                up,
                down,
                button('Remove', () => {
                    this.drafts.splice(index, 1);
                    this.renderGambits();
                })
            );
            group.append(actions);
            form.append(group);
        }
        let add = button('Add rule', () => {
            this.drafts.push({
                id: '',
                enabled: true,
                condition: '',
                percent: '',
                count: '',
                action: '',
                stance: ''
            });
            this.renderGambits({ index: this.drafts.length - 1, control: 'condition' });
        });
        add.disabled = this.drafts.length >= 5 || !this.callbacks.onGambitsChange;
        let save = element('button', 'Save gambits');
        save.type = 'submit';
        save.disabled = !this.callbacks.onGambitsChange;
        let error = element('p', undefined, 'classic-hud__error');
        error.setAttribute('role', 'alert');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            let rules = this.drafts.map((draft) => toRule(draft)),
                valid = rules.filter((rule): rule is GambitRule => rule !== undefined);
            if (
                valid.length !== rules.length ||
                new Set(valid.map((rule) => rule.id)).size !== valid.length
            ) {
                error.textContent = 'Complete every rule with valid values and a unique ID.';
                return;
            }
            error.textContent = '';
            this.callbacks.onGambitsChange?.(valid);
        });
        form.append(add, save, error);
        content.append(form);
        if (focus) {
            let groups = form.querySelectorAll('fieldset'),
                target = groups[focus.index]?.querySelector<HTMLElement>(
                    `[data-control="${focus.control}"]`
                );
            if (target instanceof HTMLButtonElement && target.disabled)
                groups[focus.index]?.querySelector<HTMLElement>('select')?.focus();
            else target?.focus();
        }
    }

    private renderRecycle(): void {
        let content = this.recycleContent;
        content.replaceChildren();
        if (!this.state.autoRecycle) {
            content.append(element('p', 'Auto-recycle state unavailable.'));
            return;
        }
        let form = element('form');
        form.append(
            element(
                'p',
                'Recycle classified offline drops matching these rarities. Cards, relics, legendary items, and unclassified drops are always kept.'
            )
        );
        for (let rarity of rarities) {
            let checkbox = element('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.recycle.includes(rarity);
            checkbox.disabled = !this.callbacks.onAutoRecycleChange;
            checkbox.addEventListener('change', () => {
                this.recycle = checkbox.checked
                    ? [...this.recycle, rarity]
                    : this.recycle.filter((value) => value !== rarity);
            });
            form.append(field(rarity, checkbox));
        }
        let save = element('button', 'Save filters');
        save.type = 'submit';
        save.disabled = !this.callbacks.onAutoRecycleChange;
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            this.callbacks.onAutoRecycleChange?.({ rarities: [...this.recycle] });
        });
        form.append(save);
        content.append(form);
    }
}
