'use client';
import { useId, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Field } from './common';
import { diets } from '@/lib/recipe-diet';
import { courses, courseLabels, type Course } from '@/lib/discovery-course';

type Options<T extends string> = readonly (readonly [T, string])[];

export function RecipeToolbar<S extends string>({
  query,
  onSearch,
  maxLength,
  sort,
  sorts,
  onSort,
  initiallyExpanded = false,
  children,
}: {
  query: string;
  onSearch: (value: string) => void;
  maxLength?: number;
  sort: S;
  sorts: Options<S>;
  onSort: (value: S) => void;
  initiallyExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const panelId = useId();
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Rechercher une recette"
            placeholder="Rechercher une recette…"
            value={query}
            maxLength={maxLength}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
        <button
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} /> Filtres
        </button>
        <select
          aria-label="Tri des recettes"
          value={sort}
          onChange={(e) => onSort(e.target.value as S)}
        >
          {sorts.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {expanded && (
        <div id={panelId} className="panel filtergrid">
          {children}
        </div>
      )}
    </>
  );
}

type FilterKey = 'cuisine' | 'ingredient' | 'diet' | 'difficulty' | 'publisher';
type FilterValues<C extends Course | ''> = Record<FilterKey, string> & {
  minutes: number;
  course: C;
};

export function RecipeFilterFields<C extends Course | ''>({
  values,
  change,
  sources,
  levels,
  allCourses = false,
}: {
  values: FilterValues<C>;
  change: (patch: Partial<FilterValues<C>>) => void;
  sources: readonly string[];
  levels: readonly string[];
  allCourses?: boolean;
}) {
  return (
    <>
      <Field label="Type de recette">
        <select value={values.course} onChange={(e) => change({ course: e.target.value as C })}>
          {allCourses && <option value="">Tous les types</option>}
          {courses.map((course) => (
            <option key={course} value={course}>
              {courseLabels[course]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Durée maximale">
        <select
          value={values.minutes}
          onChange={(e) => change({ minutes: Number(e.target.value) })}
        >
          <option value={0}>Toutes</option>
          {[15, 20, 30, 45, 60].map((n) => (
            <option value={n} key={n}>
              {n} min
            </option>
          ))}
        </select>
      </Field>
      <Field label="Cuisine">
        <input
          value={values.cuisine}
          maxLength={80}
          onChange={(e) => change({ cuisine: e.target.value })}
        />
      </Field>
      <Field label="Ingrédient">
        <input
          value={values.ingredient}
          maxLength={80}
          onChange={(e) => change({ ingredient: e.target.value })}
        />
      </Field>
      <Field label="Alimentation">
        <select value={values.diet} onChange={(e) => change({ diet: e.target.value })}>
          <option value="">Toutes</option>
          {diets.map((d) => (
            <option value={d} key={d}>
              {d === 'Végétarien' ? 'Végétarien (VG)' : d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Difficulté">
        <select value={values.difficulty} onChange={(e) => change({ difficulty: e.target.value })}>
          <option value="">Toutes</option>
          {levels.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Field>
      <Field label="Source">
        <select value={values.publisher} onChange={(e) => change({ publisher: e.target.value })}>
          <option value="">Toutes les sources</option>
          {sources.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
    </>
  );
}
