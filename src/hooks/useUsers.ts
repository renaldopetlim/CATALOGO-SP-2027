import { listUsers } from '../services/userService';
import { useResource } from './useResource';

/** Usuários do painel (perfis, contas sem acesso e convites). */
export function useUsers() {
  return useResource('admin-users', listUsers, 'carregar os usuários');
}
