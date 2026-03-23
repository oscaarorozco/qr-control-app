import { type UserView } from "@/components/admin-types";
import {
  Mail01Icon,
  Ticket01Icon,
} from "@untitledui/icons-react/outline";

type Props = {
  users: UserView[];
  selectedUserId: number | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectUser: (user: UserView) => void;
};

export function AdminUserList({
  users,
  selectedUserId,
  search,
  onSearchChange,
  onSelectUser,
}: Props) {
  return (
    <article className="card form-grid admin-user-list-card">
      <div className="section-heading">
        <div>
          <h2 className="subtitle">Usuarios</h2>
        </div>
        <span className="pill">{users.length}</span>
      </div>

      <label className="field search-field-minimal">
        <input
          aria-label="Buscar usuario por correo"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar correo"
        />
      </label>

      <div className="user-list">
        {users.length === 0 ? (
          <div className="empty-state">
            <p className="muted">No hay usuarios que coincidan con la búsqueda.</p>
          </div>
        ) : (
          users.map((user) => {
            const isSelected = user.id === selectedUserId;
            const totalUnits = user.items.reduce((acc, item) => acc + item.quantity, 0);
            const topItem = [...user.items].sort((a, b) => b.quantity - a.quantity)[0];
            const topPercent = totalUnits > 0 && topItem ? Math.round((topItem.quantity / totalUnits) * 100) : 0;

            return (
              <button
                key={user.id}
                type="button"
                className={isSelected ? "user-row user-row-active" : "user-row"}
                onClick={() => onSelectUser(user)}
              >
                <div className="user-row-main">
                  <strong className="label-inline">
                    <Mail01Icon width={14} height={14} />
                    {user.username}
                  </strong>
                  <span>#{user.id}</span>
                </div>
                <div className="user-row-meta">
                  {topItem ? (
                    <span className="label-inline">
                      <Ticket01Icon width={13} height={13} />{topItem.itemName}
                    </span>
                  ) : null}
                  <span className="label-inline">Total {totalUnits}</span>
                </div>
                <div className="ticket-bar" aria-hidden="true">
                  <div className="ticket-track">
                    <div className="ticket-fill" style={{ width: `${topPercent}%` }} />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </article>
  );
}
