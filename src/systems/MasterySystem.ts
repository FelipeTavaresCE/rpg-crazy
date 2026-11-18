export interface WeaponMastery {
    level: number;
    experience: number;
}

export type MasteryProgress = Record<string, WeaponMastery>;

export function masteryEfficiency(level: number): number {
    return Math.max(1, Math.min(100, Math.floor(level))) * 0.005;
}

export function awardMasteryExperience(
    mastery: WeaponMastery | undefined,
    experience: number
): WeaponMastery {
    let result = {
        level: Math.max(1, Math.min(100, mastery?.level ?? 1)),
        experience: Math.max(0, mastery?.experience ?? 0) + Math.max(0, experience)
    };

    while (result.level < 100 && result.experience >= result.level * 100) {
        result.experience -= result.level * 100;
        result.level++;
    }

    return result;
}

export function awardWeaponMastery(
    progress: MasteryProgress,
    family: string,
    experience: number
): MasteryProgress {
    if (!family) return progress;
    return {
        ...progress,
        [family]: awardMasteryExperience(progress[family], experience)
    };
}
