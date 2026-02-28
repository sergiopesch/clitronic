'use client';

import { useState } from 'react';
import type { ElectronicsComponent } from '@/lib/data/types';

export function ComponentCard({ component }: { component: ElectronicsComponent }) {
  const [expanded, setExpanded] = useState(false);
  const ds = component.datasheetInfo;

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{component.name}</h3>
          <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {component.category}
          </span>
        </div>
      </div>

      {/* Specs */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {component.specs.map((spec) => (
          <div key={spec.label} className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{spec.label}</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{spec.value}</div>
          </div>
        ))}
      </div>

      {/* Circuit example */}
      <div className="mt-3">
        <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Circuit Example
        </div>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{component.circuitExample}</p>
      </div>

      {/* Expandable datasheet section */}
      {ds && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {expanded ? 'Hide' : 'Show'} datasheet details
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
              {/* Pinout */}
              <div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Pinout</div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{ds.pinout}</p>
              </div>

              {/* Max Ratings */}
              <div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Maximum Ratings
                </div>
                <div className="mt-1 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <tbody>
                      {ds.maxRatings.map((r) => (
                        <tr
                          key={r.parameter}
                          className="border-b border-zinc-100 dark:border-zinc-800"
                        >
                          <td className="py-1 pr-4 text-zinc-500 dark:text-zinc-400">
                            {r.parameter}
                          </td>
                          <td className="py-1 font-medium text-zinc-900 dark:text-zinc-100">
                            {r.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Characteristics */}
              <div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Characteristics
                </div>
                <div className="mt-1 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="py-1 pr-3 text-left text-zinc-500 dark:text-zinc-400">
                          Parameter
                        </th>
                        <th className="py-1 pr-3 text-left text-zinc-500 dark:text-zinc-400">
                          Min
                        </th>
                        <th className="py-1 pr-3 text-left text-zinc-500 dark:text-zinc-400">
                          Typ
                        </th>
                        <th className="py-1 pr-3 text-left text-zinc-500 dark:text-zinc-400">
                          Max
                        </th>
                        <th className="py-1 text-left text-zinc-500 dark:text-zinc-400">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ds.characteristics.map((c) => (
                        <tr
                          key={c.parameter}
                          className="border-b border-zinc-100 dark:border-zinc-800"
                        >
                          <td className="py-1 pr-3 text-zinc-700 dark:text-zinc-300">
                            {c.parameter}
                          </td>
                          <td className="py-1 pr-3 text-zinc-900 dark:text-zinc-100">
                            {c.min ?? '—'}
                          </td>
                          <td className="py-1 pr-3 text-zinc-900 dark:text-zinc-100">
                            {c.typical ?? '—'}
                          </td>
                          <td className="py-1 pr-3 text-zinc-900 dark:text-zinc-100">
                            {c.max ?? '—'}
                          </td>
                          <td className="py-1 text-zinc-900 dark:text-zinc-100">{c.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Part Numbers */}
              <div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Common Part Numbers
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ds.partNumbers.map((pn) => (
                    <span
                      key={pn}
                      className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800"
                    >
                      {pn}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Tips</div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{ds.tips}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
