export const BASE_TILE_SIZE = 32;
export const ENTITY_ELEVATION_STEP = 16;
export const GRID_PROJECTION_ANGLE_DEGREES = 45;

export type FootprintSize = 32 | 64 | 96;

export interface Position {
    x: number;
    y: number;
}

export interface FootprintBounds {
    x: number;
    y: number;
    width: FootprintSize;
    height: FootprintSize;
    footX: number;
    footY: number;
}

export interface DepthEntity {
    y: number;
    z?: number;
}

export function getFootprintBounds(size: FootprintSize, feet: Position): FootprintBounds {
    if (![BASE_TILE_SIZE, BASE_TILE_SIZE * 2, BASE_TILE_SIZE * 3].includes(size))
        throw new RangeError('Entity footprints must be 32, 64, or 96 pixels.');

    return {
        x: feet.x - size / 2,
        y: feet.y - size,
        width: size,
        height: size,
        footX: feet.x,
        footY: feet.y
    };
}

export function getEntityDepth(entity: DepthEntity): number {
    return entity.y + (entity.z ?? 0) * ENTITY_ELEVATION_STEP;
}

export function sortEntitiesByDepth<T extends DepthEntity>(entities: readonly T[]): T[] {
    return entities
        .map((entity, index) => ({ entity, index, depth: getEntityDepth(entity) }))
        .sort((first, second) => first.depth - second.depth || first.index - second.index)
        .map(({ entity }) => entity);
}
