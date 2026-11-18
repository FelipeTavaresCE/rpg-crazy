export type CombatStance = 'Equilíbrio' | 'Avanço' | 'Guarda';

export type GambitCondition =
    | { type: 'HP_BELOW_PERCENT'; percent: number }
    | { type: 'TARGET_IS_PORTADOR_OR_BOSS' }
    | { type: 'ADJACENT_ENEMIES_GTE'; count: number }
    | { type: 'ALWAYS' };

export type GambitAction =
    | { type: 'USE_POTION_OR_HEAL' }
    | { type: 'SWITCH_STANCE'; stance: CombatStance }
    | { type: 'USE_ULTIMATE' }
    | { type: 'USE_AOE' }
    | { type: 'ATTACK_NEAREST' };

export interface GambitRule {
    id: string;
    condition: GambitCondition;
    action: GambitAction;
    enabled?: boolean;
}

export interface GambitContext {
    hitPoints: number;
    maxHitPoints: number;
    targetIsPortadorOrBoss: boolean;
    adjacentEnemies: number;
    canHeal: boolean;
    canUseUltimate: boolean;
    canUseAoe: boolean;
    hasTarget: boolean;
}

export interface GambitDecision {
    ruleId: string;
    action: GambitAction;
}

export const MAX_GAMBIT_RULES = 5;

export const DEFAULT_GAMBIT_RULES: GambitRule[] = [
    {
        id: 'critical-heal',
        condition: { type: 'HP_BELOW_PERCENT', percent: 35 },
        action: { type: 'USE_POTION_OR_HEAL' }
    },
    {
        id: 'guard-low-health',
        condition: { type: 'HP_BELOW_PERCENT', percent: 50 },
        action: { type: 'SWITCH_STANCE', stance: 'Guarda' }
    },
    {
        id: 'boss-ultimate',
        condition: { type: 'TARGET_IS_PORTADOR_OR_BOSS' },
        action: { type: 'USE_ULTIMATE' }
    },
    {
        id: 'crowd-aoe',
        condition: { type: 'ADJACENT_ENEMIES_GTE', count: 3 },
        action: { type: 'USE_AOE' }
    },
    {
        id: 'nearest-target',
        condition: { type: 'ALWAYS' },
        action: { type: 'ATTACK_NEAREST' }
    }
];

export function sanitizeGambitRules(value: unknown): GambitRule[] {
    if (!Array.isArray(value)) return DEFAULT_GAMBIT_RULES.map((rule) => ({ ...rule }));

    return value
        .slice(0, MAX_GAMBIT_RULES)
        .filter(
            (rule): rule is GambitRule =>
                !!rule &&
                typeof rule === 'object' &&
                typeof (rule as GambitRule).id === 'string' &&
                !!(rule as GambitRule).condition &&
                !!(rule as GambitRule).action &&
                isValidCondition((rule as GambitRule).condition) &&
                isValidAction((rule as GambitRule).action)
        )
        .map((rule) => ({
            id: rule.id.slice(0, 64),
            condition: { ...rule.condition },
            action: { ...rule.action },
            enabled: rule.enabled !== false
        }));
}

export function evaluateGambitRules(
    rules: GambitRule[],
    context: GambitContext
): GambitDecision | undefined {
    for (let rule of rules.slice(0, MAX_GAMBIT_RULES)) {
        if (rule.enabled === false || !matchesCondition(rule.condition, context)) continue;
        if (!canPerform(rule.action, context)) continue;
        return { ruleId: rule.id, action: rule.action };
    }
}

function matchesCondition(condition: GambitCondition, context: GambitContext): boolean {
    switch (condition.type) {
        case 'HP_BELOW_PERCENT':
            return (
                Number.isFinite(context.hitPoints) &&
                Number.isFinite(context.maxHitPoints) &&
                context.maxHitPoints > 0 &&
                (context.hitPoints / context.maxHitPoints) * 100 < condition.percent
            );
        case 'TARGET_IS_PORTADOR_OR_BOSS':
            return context.targetIsPortadorOrBoss;
        case 'ADJACENT_ENEMIES_GTE':
            return context.adjacentEnemies >= condition.count;
        case 'ALWAYS':
            return true;
    }
}

function canPerform(action: GambitAction, context: GambitContext): boolean {
    switch (action.type) {
        case 'USE_POTION_OR_HEAL':
            return context.canHeal;
        case 'USE_ULTIMATE':
            return context.canUseUltimate && context.hasTarget;
        case 'USE_AOE':
            return context.canUseAoe && context.hasTarget;
        case 'ATTACK_NEAREST':
            return context.hasTarget;
        case 'SWITCH_STANCE':
            return true;
    }
}

function isValidCondition(value: GambitCondition): boolean {
    if (!value || typeof value !== 'object') return false;

    switch (value.type) {
        case 'HP_BELOW_PERCENT':
            return Number.isFinite(value.percent) && value.percent > 0 && value.percent <= 100;
        case 'TARGET_IS_PORTADOR_OR_BOSS':
        case 'ALWAYS':
            return true;
        case 'ADJACENT_ENEMIES_GTE':
            return Number.isInteger(value.count) && value.count > 0;
        default:
            return false;
    }
}

function isValidAction(value: GambitAction): boolean {
    if (!value || typeof value !== 'object') return false;

    switch (value.type) {
        case 'USE_POTION_OR_HEAL':
        case 'USE_ULTIMATE':
        case 'USE_AOE':
        case 'ATTACK_NEAREST':
            return true;
        case 'SWITCH_STANCE':
            return ['Equilíbrio', 'Avanço', 'Guarda'].includes(value.stance);
        default:
            return false;
    }
}
