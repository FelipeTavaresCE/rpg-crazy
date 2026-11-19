/* eslint-disable unicorn/filename-case -- The modal's public path is specified by the design. */
import items from '../data/items.json';
import { getWorldCycleState } from '../engine/world-cycle';

import type { OfflineHuntReport } from '@kaetram/common/network/impl/autohunt';

type ReturnReport = OfflineHuntReport & {
    deaths?: number;
    retainedDrops?: string[];
    superiorGear?: string[];
};

type ItemDefinition = { name: string; type: string };
const itemCatalog: { [key: string]: ItemDefinition } = items;

function itemFor(key: string): ItemDefinition | undefined {
    return Object.hasOwn(itemCatalog, key) ? itemCatalog[key] : undefined;
}

function formatDuration(milliseconds: number): string {
    let minutes = Math.floor(Math.max(0, milliseconds) / 60_000);
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

export default class OfflineReportModal {
    public constructor(private dialog: HTMLDialogElement) {
        this.dialog
            .querySelector<HTMLButtonElement>('.offline-report-close')!
            .addEventListener('click', () => this.dialog.close());
    }

    public show(report: ReturnReport): void {
        this.setText('.offline-report-time', formatDuration(report.duration));
        this.setText('.offline-report-eclipse-time', formatDuration(report.eclipseDurationMs ?? 0));
        this.setText('.offline-report-kills', `${report.kills}`);
        this.setText(
            '.offline-report-portadores',
            report.portadorKills === undefined ? 'Não informado' : `${report.portadorKills}`
        );
        this.setText('.offline-report-experience', `${report.experience}`);
        this.setText('.offline-report-levels', `${report.levelsGained ?? 0}`);
        this.setText(
            '.offline-report-deaths',
            report.deaths === undefined ? 'Não informado' : `${report.deaths}`
        );
        this.setText(
            '.offline-report-loot',
            `${report.lootCollected} itens coletados; ${report.lootOverflow} não couberam.`
        );

        let retained = Array.isArray(report.retainedDrops) ? report.retainedDrops : undefined,
            highlights = retained?.filter((key) => {
                if (typeof key !== 'string') return false;
                let item = itemFor(key);
                return item?.type === 'card' || item?.type === 'relic';
            }),
            gear = Array.isArray(report.superiorGear)
                ? report.superiorGear.filter((key) => typeof key === 'string')
                : undefined;

        this.setText(
            '.offline-report-highlights',
            highlights
                ? highlights.length > 0
                    ? highlights.map((key) => itemFor(key)!.name).join(', ')
                    : 'Nenhuma carta ou relíquia informada.'
                : 'Destaques de cartas e relíquias não informados.'
        );
        this.setText(
            '.offline-report-gear',
            gear
                ? gear.length > 0
                    ? gear.map((key) => itemFor(key)?.name ?? key).join(', ') +
                      (report.superiorGearComparisonIncomplete
                          ? ' (algumas comparações indisponíveis).'
                          : '')
                    : report.superiorGearComparisonIncomplete
                    ? 'Comparação de equipamentos indisponível.'
                    : 'Nenhum equipamento superior informado.'
                : 'Comparação de equipamentos indisponível.'
        );

        let suggestions: string[] = [];
        if (typeof report.deaths === 'number' && report.deaths > 0)
            suggestions.push(
                `Você caiu ${report.deaths} vez(es); considere equipar uma Gema Vampírica, ativar um Gambit de cura ou usar a Postura de Guarda.`
            );
        if (report.lootOverflow > 0)
            suggestions.push('Libere espaço no inventário para recolher mais itens.');
        if (suggestions.length === 0)
            suggestions.push('Revise seus recursos e Gambits antes da próxima caçada.');
        this.setText('.offline-report-suggestion', suggestions.join(' '));
        this.setText('.offline-report-reason', report.reason);

        let now = Date.now(),
            cycle = getWorldCycleState(now),
            remaining = Math.ceil((cycle.nextTransitionAt - now) / 60_000);
        this.setText(
            '.offline-report-opportunity',
            cycle.phase === 'eclipse'
                ? `O mundo está em Eclipse. Aurora começa em ${remaining} min.`
                : `O mundo está em Aurora. Eclipse começa em ${remaining} min.`
        );
        if (!this.dialog.open) this.dialog.showModal();
    }

    private setText(selector: string, value: string): void {
        this.dialog.querySelector<HTMLElement>(selector)!.textContent = value;
    }
}
