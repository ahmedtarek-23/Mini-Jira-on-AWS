import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
  createdAt: string;
}

interface AppUser {
  userId: string;
  email: string;
  role: string;
  teamId: string | null;
}

function TeamMembers({ teamId }: { teamId: string }) {
  const [members, setMembers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");

  const fetchMembers = useCallback(async () => {
    try {
      const data = await api.get(`/users?teamId=${teamId}`);
      setMembers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const fetchAllUsers = useCallback(async () => {
    try {
      const data = await api.get("/users");
      setAllUsers(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const unassigned = allUsers.filter(
    (u) => !u.teamId || u.teamId !== teamId,
  );

  async function handleAssign() {
    if (!selectedUser) return;
    try {
      await api.put(`/users/${selectedUser}/team`, { teamId });
      toast.success("User assigned to team");
      setAssignOpen(false);
      setSelectedUser("");
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await api.put(`/users/${userId}/team`, { teamId: null });
      toast.success("User removed from team");
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Members ({members.length})</span>
        <Button variant="outline" size="sm" onClick={() => { fetchAllUsers(); setAssignOpen(true); }}>
          <Plus className="size-3.5 mr-1" />
          Assign
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No members</p>
      ) : (
        <div className="flex flex-col gap-1">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded border px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">{m.email}</span>
                <Badge variant="outline" className="text-xs">{m.role}</Badge>
              </div>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => handleRemove(m.userId)}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign user to team</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {unassigned.map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssign} disabled={!selectedUser}>
              Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    try {
      const data = await api.get("/teams");
      setTeams(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post("/teams", { name: name.trim() });
      toast.success("Team created");
      setName("");
      setOpen(false);
      fetchTeams();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEditStart(t: Team) {
    setEditTeam(t);
    setEditName(t.name);
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editName.trim() || !editTeam) return;
    setEditSaving(true);
    try {
      await api.put(`/teams/${editTeam.id}`, { name: editName.trim() });
      toast.success("Team updated");
      setEditOpen(false);
      setEditTeam(null);
      fetchTeams();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this team?")) return;
    try {
      await api.del(`/teams/${id}`);
      toast.success("Team deleted");
      fetchTeams();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1" />
          New team
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={handleCreate} disabled={!name.trim() || saving}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditTeam(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input placeholder="Team name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Button onClick={handleEditSave} disabled={!editName.trim() || editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Users className="size-12" />
          <p className="text-sm">No teams yet</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => handleEditStart(t)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {expandedTeam === t.id ? (
                  <TeamMembers teamId={t.id} />
                ) : (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpandedTeam(t.id)}>
                    <Users className="size-3.5 mr-1" />
                    View members
                  </Button>
                )}
                {expandedTeam === t.id && (
                  <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setExpandedTeam(null)}>
                    Collapse
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
