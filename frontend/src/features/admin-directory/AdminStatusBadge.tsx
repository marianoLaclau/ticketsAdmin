import { Badge } from '@/components/ui/badge';

export function AdminStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
      Activo
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-slate-500">
      Inactivo
    </Badge>
  );
}
