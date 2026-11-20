import { useId } from 'react';
import {
  PERMISSION_INFO,
  PERMISSION_KEYS,
  ROLE_INFO,
  USER_ROLES,
  presetPermissions,
  roleForPermissions,
  type PermissionKey,
  type UserPermissions,
  type UserRole,
} from '../../types/users';

type PermissionEditorProps = {
  role: UserRole;
  permissions: UserPermissions;
  onChange: (role: UserRole, permissions: UserPermissions) => void;
  disabled?: boolean;
};

/**
 * Perfil rápido (Administrador / Editor de catálogo / Apenas consulta) +
 * permissões individuais. Marcar ou desmarcar uma permissão ajusta o perfil:
 * todas → Administrador, nenhuma → Apenas consulta, misto → Editor.
 */
export function PermissionEditor({ role, permissions, onChange, disabled = false }: PermissionEditorProps) {
  const baseId = useId();

  const toggle = (key: PermissionKey, value: boolean) => {
    const next = { ...permissions, [key]: value };
    onChange(roleForPermissions(next), next);
  };

  return (
    <div className="permission-editor">
      <div className="role-presets" role="radiogroup" aria-label="Perfil rápido">
        {USER_ROLES.map((option) => (
          <label key={option} className={`role-card${role === option ? ' on' : ''}${disabled ? ' off' : ''}`}>
            <input
              type="radio"
              name={`${baseId}-role`}
              value={option}
              checked={role === option}
              disabled={disabled}
              onChange={() => onChange(option, presetPermissions(option))}
            />
            <b>{ROLE_INFO[option].label}</b>
            <span>{ROLE_INFO[option].description}</span>
          </label>
        ))}
      </div>

      <ul className="permission-list">
        {PERMISSION_KEYS.map((key) => {
          const id = `${baseId}-${key}`;
          return (
            <li key={key}>
              <input id={id} type="checkbox" checked={permissions[key]} disabled={disabled} onChange={(e) => toggle(key, e.target.checked)} />
              <label htmlFor={id}>
                <b>{PERMISSION_INFO[key].label}</b>
                <span>{PERMISSION_INFO[key].description}</span>
                <code>{key}</code>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
