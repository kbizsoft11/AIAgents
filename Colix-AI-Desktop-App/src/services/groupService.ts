export type Group = {
  id: string;
  name: string;
  description: string;
  sort_order?: number | null;
  created_at?: string;
  updated_at?: string;
  members?: unknown[];
};

/** Service for fetching and creating workspace groups */
export const groupService = {
  /** GET groups for a workspace */
  async getAll(workspaceId: string): Promise<Group[]> {
    const url = `https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php?workspace_id=${workspaceId}`;
    const response = await fetch(url, {
       headers: {
      'X-User-Email': "abhishekkumarphp.kbizsoft@gmail.com"
    }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch groups (status ${response.status})`);
    }
    const data = await response.json();
    // Extract groups array from response
    return data.groups || [];
  },

  /** POST create a new group */
  async create(workspaceId: string, name: string, description: string): Promise<Group> {
    const url = `https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php`;
    const payload = {
      action: 'create_group',
      workspace_id: workspaceId,
      name,
      description,
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': "abhishekkumarphp.kbizsoft@gmail.com",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Failed to create group (status ${response.status})`);
    }
    return response.json();
  },

  /** Update an existing workspace group */
  async update(workspaceId: string, groupId: string, name: string, description: string): Promise<Group> {
    const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': 'abhishekkumarphp.kbizsoft@gmail.com',
      },
      body: JSON.stringify({ action: 'update_group', workspace_id: workspaceId, group_id: groupId, name, description }),
    });
    if (!response.ok) throw new Error(`Failed to update group (status ${response.status})`);
    const data = await response.json() as { group?: Group } & Group;
    return data.group || data;
  },

  /** Delete an existing workspace group */
  async remove(workspaceId: string, groupId: string): Promise<void> {
    const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/workspace-groups.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': 'abhishekkumarphp.kbizsoft@gmail.com',
      },
      body: JSON.stringify({ action: 'delete_group', workspace_id: workspaceId, group_id: groupId }),
    });
    if (!response.ok) throw new Error(`Failed to delete group (status ${response.status})`);
  },
};
