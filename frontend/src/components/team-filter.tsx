"use client";

import { Filter } from "lucide-react";
import { Select } from "@/components/ui/form-controls";
import type { Team } from "@/lib/types";

export function TeamFilter({
  teams,
  value,
  onChange,
  showAll = true,
}: {
  teams: Team[];
  value: string;
  onChange: (value: string) => void;
  showAll?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onChange={(event) => onChange(event.target.value)} className="w-44">
        {showAll ? <option value="all">All teams</option> : null}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
