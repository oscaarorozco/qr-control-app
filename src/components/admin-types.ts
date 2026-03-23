export type UserItemView = {
  itemTypeId: number;
  itemName: string;
  quantity: number;
};

export type ItemTypeView = {
  id: number;
  name: string;
  imageUrl: string | null;
  dailyScanLimit: number | null;
};

export type UserView = {
  id: number;
  username: string;
  items: UserItemView[];
};

export type AdminSummary = {
  totalUsers: number;
  totalUnits: number;
};

export type AdminActivityItem = {
  id: number;
  action: string;
  actorEmail: string;
  targetEmail: string;
  details: string;
  createdAt: string;
};

export type ScanModeView = {
  id: number;
  name: string;
  startTime: string | null;
  endTime: string | null;
  items: Array<{
    itemTypeId: number;
    itemName: string;
    operation: "add" | "remove";
    quantity: number;
  }>;
};
