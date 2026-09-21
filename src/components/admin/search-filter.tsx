'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Admin list filters.
 *
 * Kept in the URL like the storefront's, so an admin can bookmark "orders
 * awaiting fulfilment" or paste it to a colleague.
 */
export function SearchFilter({
  basePath,
  placeholder,
  filters = [],
}: {
  basePath: string;
  placeholder: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  function apply(overrides: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    params.delete('page');
    const search = params.toString();
    router.push(search ? `${basePath}?${search}` : basePath);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: query.trim() || null });
      }}
      className="flex flex-wrap items-end gap-2"
      role="search"
    >
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="admin-search" className="sr-only">
          {placeholder}
        </label>
        <Input
          id="admin-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="h-10 bg-white"
        />
      </div>

      {filters.map((filter) => (
        <div key={filter.name}>
          <label htmlFor={`filter-${filter.name}`} className="sr-only">
            {filter.label}
          </label>
          <Select
            id={`filter-${filter.name}`}
            value={searchParams.get(filter.name) ?? ''}
            onChange={(event) => apply({ [filter.name]: event.target.value || null })}
            className="h-10 w-auto min-w-[9rem] bg-white text-sm"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      <Button type="submit" variant="outline" size="md" className="h-10">
        <Search className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Search
      </Button>
    </form>
  );
}
