import assert from 'node:assert/strict';
import test from 'node:test';

import OfflineReportModal from './OfflineReportModal';

import type { OfflineHuntReport } from '@kaetram/common/network/impl/autohunt';

test('modal distinguishes unavailable, partial and completed gear comparisons', () => {
    let elements = new Map<string, { textContent: string; addEventListener(): void }>(),
        dialog = {
            open: false,
            querySelector: (selector: string) => {
                if (!elements.has(selector))
                    elements.set(selector, { textContent: '', addEventListener: () => {} });
                return elements.get(selector);
            },
            showModal: () => {},
            close: () => {}
        },
        modal = new OfflineReportModal(dialog as unknown as HTMLDialogElement),
        report: OfflineHuntReport = {
            duration: 0,
            kills: 0,
            experience: 0,
            lootCollected: 0,
            lootOverflow: 0,
            reason: ''
        };
    modal.show({ ...report, superiorGearComparisonIncomplete: true });
    assert.equal(
        elements.get('.offline-report-gear')?.textContent,
        'Comparação de equipamentos indisponível.'
    );
    modal.show({ ...report, superiorGear: [], superiorGearComparisonIncomplete: true });
    assert.equal(
        elements.get('.offline-report-gear')?.textContent,
        'Comparação de equipamentos indisponível.'
    );
    modal.show({
        ...report,
        superiorGear: ['mosswood_blade'],
        superiorGearComparisonIncomplete: true
    });
    assert.equal(
        elements.get('.offline-report-gear')?.textContent,
        'Lâmina do Bosque (algumas comparações indisponíveis).'
    );
    modal.show({ ...report, superiorGear: [] });
    assert.equal(
        elements.get('.offline-report-gear')?.textContent,
        'Nenhum equipamento superior informado.'
    );
});
