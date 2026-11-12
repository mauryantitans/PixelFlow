import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ApiService } from '../services/api';
import { OperationSchema, OperationSpecDTO } from '../types';

// library display name -> { subcategory -> [operation labels] }
type Palette = Record<string, Record<string, string[]>>;

interface OperationSchemaContextValue {
  loading: boolean;
  error: string | null;
  /** Resolve an operation by id OR display label (case-insensitive). */
  getOp: (idOrLabel: string) => OperationSpecDTO | undefined;
  /** Default params (name -> default value) for an operation. */
  getDefaults: (idOrLabel: string) => Record<string, any>;
  /** Grouped operations for the sidebar palette. */
  palette: Palette;
  /** Flat list of all operation labels (for search). */
  allLabels: string[];
}

// Backend category "Basic" surfaces in the UI as "Basic Operations" (matches icons).
const LIBRARY_DISPLAY: Record<string, string> = { Basic: 'Basic Operations' };

function buildFromSchema(schema: OperationSchema): { specs: OperationSpecDTO[]; palette: Palette } {
  const specs: OperationSpecDTO[] = [];
  const palette: Palette = {};
  schema.categories.forEach((cat) => {
    const lib = LIBRARY_DISPLAY[cat.name] ?? cat.name;
    const group: Record<string, string[]> = {};
    cat.subcategories.forEach((sub) => {
      const subName = sub.name ?? 'Operations';
      if (!group[subName]) group[subName] = [];
      sub.operations.forEach((op) => {
        specs.push(op);
        // Hidden ops (e.g. Custom Filter) still render as steps but aren't
        // added from the palette.
        if (!op.hidden) group[subName].push(op.label);
      });
      if (group[subName].length === 0) delete group[subName];
    });
    palette[lib] = group;
  });
  return { specs, palette };
}

const Ctx = createContext<OperationSchemaContextValue | null>(null);

/**
 * Fetches the operation schema once at startup and is the single source of
 * truth for the operation palette and parameter metadata. While loading (or on
 * error) the palette is empty and consumers render a loading/error state.
 */
export const OperationSchemaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [schema, setSchema] = useState<OperationSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ApiService.getOperationsSchema()
      .then((s) => {
        if (active) {
          setSchema(s);
          setError(null);
        }
      })
      .catch((e: any) => {
        if (active) setError(e?.message ?? 'Failed to load operations');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<OperationSchemaContextValue>(() => {
    const { specs, palette } =
      schema && schema.categories?.length
        ? buildFromSchema(schema)
        : { specs: [] as OperationSpecDTO[], palette: {} as Palette };

    const index = new Map<string, OperationSpecDTO>();
    specs.forEach((s) => {
      index.set(s.id.toLowerCase(), s);
      index.set(s.label.toLowerCase(), s);
    });

    const getOp = (k: string) => index.get((k ?? '').toLowerCase());
    const getDefaults = (k: string) => {
      const out: Record<string, any> = {};
      getOp(k)?.params.forEach((p) => {
        if (p.default !== null && p.default !== undefined) out[p.name] = p.default;
      });
      return out;
    };

    return { loading, error, getOp, getDefaults, palette, allLabels: specs.filter((s) => !s.hidden).map((s) => s.label) };
  }, [schema, loading, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useOperationSchema(): OperationSchemaContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useOperationSchema must be used within OperationSchemaProvider');
  }
  return ctx;
}
