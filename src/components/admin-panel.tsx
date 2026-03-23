"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  BarChartSquare02Icon,
  Camera01Icon,
  ChevronDownIcon,
  Dataflow03Icon,
  Download01Icon,
  Edit03Icon,
  Mail01Icon,
  MarkerPin01Icon,
  MessageChatCircleIcon,
  PuzzlePiece01Icon,
  RefreshCw01Icon,
  Save01Icon,
  Ticket01Icon,
  Trash01Icon,
  Users01Icon,
} from "@untitledui/icons-react/outline";
import { type ChangeEvent, type CSSProperties, FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminUserList } from "@/components/admin-user-list";
import type { AdminScope } from "@/lib/auth";
import {
  type AdminActivityItem,
  type AdminSummary,
  type ItemTypeView,
  type ScanModeView,
  type UserView,
} from "@/components/admin-types";

type UsersResponse = {
  users: UserView[];
  summary: AdminSummary;
  itemTypes: ItemTypeView[];
  error?: string;
};

type OnboardingData = {
  setupLink: string;
  expiresAt?: string | null;
  mailtoLink: string;
  whatsappLink?: string;
};

type ActivityResponse = {
  items: AdminActivityItem[];
  error?: string;
};

type ActivityFilter = {
  action: string;
  dateFrom: string;
  dateTo: string;
};

type SecurityMetrics = {
  days: number;
  totalDenied: number;
  last24hDenied: number;
  byDay: Array<{ day: string; count: number }>;
  byEndpoint: Array<{ pathname: string; count: number }>;
};

type SecurityMetricsResponse = {
  ok?: boolean;
  metrics?: SecurityMetrics;
  error?: string;
};

type AdminStaffMember = {
  id: number;
  username: string;
  scope: "admin" | "operator";
};

type StaffResponse = {
  ok?: boolean;
  staff?: AdminStaffMember[];
  member?: AdminStaffMember | null;
  onboarding?: OnboardingData;
  error?: string;
};

type ScanModesResponse = {
  modes: ScanModeView[];
  error?: string;
};

type ScanApplyResponse = {
  user?: UserView;
  mode?: ScanModeView;
  undoAvailableUntil?: string | null;
  error?: string;
};

type ScanUndoResponse = {
  user?: UserView;
  ok?: boolean;
  pendingUndo?: {
    undoActionId: number;
    targetUserId: number;
    expiresAt: string;
  } | null;
  error?: string;
};

type DailyUsageResponse = {
  ok?: boolean;
  usage?: Array<{
    itemTypeId: number;
    usedQuantity: number;
  }>;
  error?: string;
};

type ResetResponse = {
  ok: true;
  result: {
    deletedUserCount: number;
    deletedBalanceCount: number;
    deletedModeCount: number;
    deletedModeItemCount: number;
    deletedLogCount: number;
    previousManagedUserCount: number;
    remainingItemTypes: number;
  };
  error?: string;
};

type ScanBehavior = "view" | "mode";

type AdminSection = "analytics" | "components" | "modes" | "create" | "scan" | "users";

const emptySummary: AdminSummary = {
  totalUsers: 0,
  totalUnits: 0,
};

const emptySecurityMetrics: SecurityMetrics = {
  days: 7,
  totalDenied: 0,
  last24hDenied: 0,
  byDay: [],
  byEndpoint: [],
};

function normalizeToken(token: string) {
  const value = token.trim();
  if (value.startsWith("QRCAPP:")) {
    return value.slice(7);
  }
  return value;
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map((value) => Number(value));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function isScheduleActiveNow(startTime: string | null, endTime: string | null, now = new Date()) {
  if (!startTime || !endTime) {
    return true;
  }

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start === null || end === null) {
    return true;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (start === end) {
    return true;
  }

  if (start < end) {
    return nowMinutes >= start && nowMinutes <= end;
  }

  return nowMinutes >= start || nowMinutes <= end;
}

function formatActivityDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActivityDetails(details: string) {
  if (!details || details.trim().length === 0) {
    return "Sin detalles";
  }

  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const entries = Object.entries(parsed).slice(0, 4);
    if (entries.length === 0) {
      return "Sin detalles";
    }

    return entries
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join(" · ");
  } catch {
    return details;
  }
}

type AdminPanelProps = {
  adminScope: AdminScope;
  currentAdminId: number;
};

export function AdminPanel({ adminScope, currentAdminId }: AdminPanelProps) {
  const canRead = adminScope === "admin";
  const canScan = adminScope === "admin";
  const canManage = adminScope === "admin";
  const canExecuteModes = adminScope === "admin" || adminScope === "operator";

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [users, setUsers] = useState<UserView[]>([]);
  const [summary, setSummary] = useState<AdminSummary>(emptySummary);
  const [itemTypes, setItemTypes] = useState<ItemTypeView[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [componentSearch, setComponentSearch] = useState("");
  const deferredComponentSearch = useDeferredValue(componentSearch);

  const [createUserEmail, setCreateUserEmail] = useState("");
  const [createUserWhatsapp, setCreateUserWhatsapp] = useState("");
  const [createAssignments, setCreateAssignments] = useState<Record<number, number>>({});
  const [newItemTypeName, setNewItemTypeName] = useState("");
  const [newItemTypeInitialQuantity, setNewItemTypeInitialQuantity] = useState(0);
  const [newItemTypeImageUrl, setNewItemTypeImageUrl] = useState("");
  const [componentNames, setComponentNames] = useState<Record<number, string>>({});
  const [componentImageUrls, setComponentImageUrls] = useState<Record<number, string>>({});
  const [componentDailyLimits, setComponentDailyLimits] = useState<Record<number, string>>({});
  const [uploadingNewComponentImage, setUploadingNewComponentImage] = useState(false);
  const [uploadingComponentImageById, setUploadingComponentImageById] = useState<Record<number, boolean>>({});
  const [lastOnboarding, setLastOnboarding] = useState<OnboardingData | null>(null);
  const [lastPasswordReset, setLastPasswordReset] = useState<OnboardingData | null>(null);
  const [activity, setActivity] = useState<AdminActivityItem[]>([]);
  const [actionLog, setActionLog] = useState<AdminActivityItem[]>([]);
  const [, setLoadingActivity] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>({
    action: "",
    dateFrom: "",
    dateTo: "",
  });
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics>(emptySecurityMetrics);
  const [adminStaff, setAdminStaff] = useState<AdminStaffMember[]>([]);
  const [staffScopeDrafts, setStaffScopeDrafts] = useState<Record<number, "admin" | "operator">>({});
  const [savingStaffScopeId, setSavingStaffScopeId] = useState<number | null>(null);
  const [deletingStaffId, setDeletingStaffId] = useState<number | null>(null);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffWhatsapp, setNewStaffWhatsapp] = useState("");
  const [newStaffScope, setNewStaffScope] = useState<"admin" | "operator">("operator");
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [lastStaffOnboarding, setLastStaffOnboarding] = useState<OnboardingData | null>(null);
  const activityFilterRef = useRef<ActivityFilter>({
    action: "",
    dateFrom: "",
    dateTo: "",
  });
  const [bulkItemTypeId, setBulkItemTypeId] = useState<number | null>(null);
  const [bulkMode, setBulkMode] = useState<"add" | "set">("add");
  const [bulkQuantity, setBulkQuantity] = useState(0);
  const [scanModes, setScanModes] = useState<ScanModeView[]>([]);
  const [newScanModeName, setNewScanModeName] = useState("");
  const [newScanModeStartTime, setNewScanModeStartTime] = useState("");
  const [newScanModeEndTime, setNewScanModeEndTime] = useState("");
  const [scanModeOps, setScanModeOps] = useState<Record<number, "add" | "remove">>({});
  const [scanModeQuantities, setScanModeQuantities] = useState<Record<number, number>>({});
  const [activeScanModeId, setActiveScanModeId] = useState<number | null>(null);
  const [modeView, setModeView] = useState<"new" | "select" | "modify" | null>(null);
  const [editModeId, setEditModeId] = useState<number | null>(null);
  const [editModeName, setEditModeName] = useState("");
  const [editModeStartTime, setEditModeStartTime] = useState("");
  const [editModeEndTime, setEditModeEndTime] = useState("");
  const [editModeOps, setEditModeOps] = useState<Record<number, "add" | "remove">>({});
  const [editModeQuantities, setEditModeQuantities] = useState<Record<number, number>>({});

  const [manualToken, setManualToken] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserView | null>(null);
  const [resetWhatsappPhone, setResetWhatsappPhone] = useState("");
  const [resettingData, setResettingData] = useState(false);

  const [updateMode, setUpdateMode] = useState<"add" | "set">("add");
  const [itemQuantities, setItemQuantities] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const updateFormRef = useRef<HTMLFormElement | null>(null);
  const holdLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const processingScanRef = useRef(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [scanBehavior, setScanBehavior] = useState<ScanBehavior>("view");
  const [undoDeadlineMs, setUndoDeadlineMs] = useState<number | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [undoingScan, setUndoingScan] = useState(false);
  const [dailyUsageByItemType, setDailyUsageByItemType] = useState<Record<number, number>>({});
  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [heldTabId, setHeldTabId] = useState<AdminSection | null>(null);

  const ensureValueMap = useCallback((types: ItemTypeView[], current: Record<number, number>) => {
    const next: Record<number, number> = {};
    for (const type of types) {
      next[type.id] = current[type.id] ?? 0;
    }
    return next;
  }, []);

  const ensureOperationMap = useCallback((types: ItemTypeView[], current: Record<number, "add" | "remove">) => {
    const next: Record<number, "add" | "remove"> = {};
    for (const type of types) {
      next[type.id] = current[type.id] ?? "add";
    }
    return next;
  }, []);

  const syncSelectedUser = useCallback((user: UserView | null) => {
    setSelectedUser(user);

    if (!user) {
      setItemQuantities({});
      setNote("");
      return;
    }

    const quantities: Record<number, number> = {};
    for (const item of user.items) {
      quantities[item.itemTypeId] = 0;
    }

    setItemQuantities(quantities);
    setNote("");
  }, []);

  const mergeUser = useCallback((updatedUser: UserView) => {
    setUsers((currentUsers) =>
      currentUsers
        .map((user) => (user.id === updatedUser.id ? updatedUser : user))
        .sort((left, right) => left.username.localeCompare(right.username, "es")),
    );
  }, []);

  const refreshUsers = useCallback(async (nextSelectedUserId?: number | null) => {
    setLoadingUsers(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as UsersResponse | null;

      if (!response.ok || !data) {
        const errorMessage = data?.error ?? "No se pudo cargar la lista de usuarios";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setUsers(data.users);
      setSummary(data.summary);
      setItemTypes(data.itemTypes ?? []);
      setCreateAssignments((current) => ensureValueMap(data.itemTypes ?? [], current));
      setItemQuantities((current) => ensureValueMap(data.itemTypes ?? [], current));
      setScanModeQuantities((current) => ensureValueMap(data.itemTypes ?? [], current));
      setEditModeQuantities((current) => ensureValueMap(data.itemTypes ?? [], current));
      setScanModeOps((current) => ensureOperationMap(data.itemTypes ?? [], current));
      setEditModeOps((current) => ensureOperationMap(data.itemTypes ?? [], current));
      setComponentNames((current) => {
        const next: Record<number, string> = {};
        for (const item of data.itemTypes ?? []) {
          next[item.id] = current[item.id] ?? item.name;
        }
        return next;
      });
      setComponentImageUrls((current) => {
        const next: Record<number, string> = {};
        for (const item of data.itemTypes ?? []) {
          next[item.id] = current[item.id] ?? (item.imageUrl ?? "");
        }
        return next;
      });
      setComponentDailyLimits((current) => {
        const next: Record<number, string> = {};
        for (const item of data.itemTypes ?? []) {
          const fallback = typeof item.dailyScanLimit === "number" && item.dailyScanLimit > 0
            ? String(item.dailyScanLimit)
            : "";
          next[item.id] = current[item.id] ?? fallback;
        }
        return next;
      });

      if (!bulkItemTypeId && (data.itemTypes?.length ?? 0) > 0) {
        setBulkItemTypeId(data.itemTypes[0].id);
      }

      const selectedId = nextSelectedUserId ?? selectedUser?.id ?? null;
      if (!selectedId) {
        return;
      }

      const refreshedSelectedUser = data.users.find((user) => user.id === selectedId) ?? null;
      syncSelectedUser(refreshedSelectedUser);
    } catch {
      setError("No se pudo cargar el panel de administración");
      toast.error("No se pudo cargar el panel de administración");
    } finally {
      setLoadingUsers(false);
    }
  }, [bulkItemTypeId, ensureOperationMap, ensureValueMap, selectedUser?.id, syncSelectedUser]);

  const refreshScanModes = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/scan-modes", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as ScanModesResponse | null;
      if (!response.ok || !data) {
        return;
      }

      const modes = data.modes ?? [];
      setScanModes(modes);

      if (modes.length === 0) {
        setActiveScanModeId(null);
        setEditModeId(null);
        return;
      }

      if (!activeScanModeId || !modes.some((mode) => mode.id === activeScanModeId)) {
        setActiveScanModeId(modes[0].id);
      }

      if (!editModeId || !modes.some((mode) => mode.id === editModeId)) {
        setEditModeId(modes[0].id);
      }
    } catch {
      // Ignore scan modes refresh errors to avoid blocking panel usage.
    }
  }, [activeScanModeId, editModeId]);

  const loadModeForEdit = useCallback(
    (modeId: number | null) => {
      if (!modeId) {
        setEditModeName("");
        setEditModeStartTime("");
        setEditModeEndTime("");
        setEditModeOps(ensureOperationMap(itemTypes, {}));
        setEditModeQuantities(ensureValueMap(itemTypes, {}));
        return;
      }

      const selectedMode = scanModes.find((mode) => mode.id === modeId);
      if (!selectedMode) {
        return;
      }

      const nextOps = ensureOperationMap(itemTypes, {});
      const nextQuantities = ensureValueMap(itemTypes, {});

      for (const item of selectedMode.items) {
        nextOps[item.itemTypeId] = item.operation;
        nextQuantities[item.itemTypeId] = item.quantity;
      }

      setEditModeName(selectedMode.name);
  setEditModeStartTime(selectedMode.startTime ?? "");
  setEditModeEndTime(selectedMode.endTime ?? "");
      setEditModeOps(nextOps);
      setEditModeQuantities(nextQuantities);
    },
    [ensureOperationMap, ensureValueMap, itemTypes, scanModes],
  );

  useEffect(() => {
    loadModeForEdit(editModeId);
  }, [editModeId, loadModeForEdit]);

  useEffect(() => {
    if (!canManage && (modeView === "new" || modeView === "modify")) {
      setModeView(null);
    }
  }, [canManage, modeView]);

  useEffect(() => {
    activityFilterRef.current = activityFilter;
  }, [activityFilter]);

  const refreshActivity = useCallback(async (overrideFilter?: ActivityFilter) => {
    setLoadingActivity(true);

    try {
      const currentFilter = overrideFilter ?? activityFilterRef.current;
      const query = new URLSearchParams({ limit: "8" });
      if (currentFilter.action.trim()) {
        query.set("action", currentFilter.action.trim());
      }
      if (currentFilter.dateFrom) {
        query.set("dateFrom", currentFilter.dateFrom);
      }
      if (currentFilter.dateTo) {
        query.set("dateTo", currentFilter.dateTo);
      }

      const response = await fetch(`/api/admin/activity?${query.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as ActivityResponse | null;

      if (!response.ok || !data) {
        return;
      }

      setActivity(data.items ?? []);
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  const refreshSelectedUserDailyUsage = useCallback(async (targetUserId?: number | null) => {
    const userId = targetUserId ?? selectedUser?.id ?? null;
    if (!userId) {
      setDailyUsageByItemType({});
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/daily-usage?userId=${userId}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as DailyUsageResponse | null;
      if (!response.ok || !data?.ok || !data.usage) {
        setDailyUsageByItemType({});
        return;
      }

      const next: Record<number, number> = {};
      for (const row of data.usage) {
        next[row.itemTypeId] = Math.max(0, Number(row.usedQuantity ?? 0));
      }

      setDailyUsageByItemType(next);
    } catch {
      setDailyUsageByItemType({});
    }
  }, [selectedUser?.id]);

  const refreshActionLog = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/activity?limit=30", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as ActivityResponse | null;
      if (!response.ok || !data) {
        setActionLog([]);
        return;
      }

      setActionLog(data.items ?? []);
    } catch {
      setActionLog([]);
    }
  }, []);

  const refreshSecurityMetrics = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/security-metrics?days=7", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as SecurityMetricsResponse | null;
      if (!response.ok || !data?.ok || !data.metrics) {
        setSecurityMetrics(emptySecurityMetrics);
        return;
      }

      setSecurityMetrics(data.metrics);
    } catch {
      setSecurityMetrics(emptySecurityMetrics);
    }
  }, []);

  const refreshAdminStaff = useCallback(async () => {
    if (!canManage) {
      setAdminStaff([]);
      setStaffScopeDrafts({});
      return;
    }

    try {
      const response = await fetch("/api/admin/staff", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as StaffResponse | null;
      if (!response.ok || !data?.ok || !data.staff) {
        setAdminStaff([]);
        setStaffScopeDrafts({});
        return;
      }

      setAdminStaff(data.staff);
      setStaffScopeDrafts((current) => {
        const next: Record<number, "admin" | "operator"> = {};
        for (const member of data.staff ?? []) {
          next[member.id] = current[member.id] ?? member.scope;
        }
        return next;
      });
    } catch {
      setAdminStaff([]);
      setStaffScopeDrafts({});
    }
  }, [canManage]);

  const refreshScanUndoState = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/scan-undo", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as ScanUndoResponse | null;
      if (!response.ok || !data?.ok || !data.pendingUndo?.expiresAt) {
        setUndoDeadlineMs(null);
        return;
      }

      const nextDeadline = new Date(data.pendingUndo.expiresAt).getTime();
      if (!Number.isFinite(nextDeadline) || nextDeadline <= Date.now()) {
        setUndoDeadlineMs(null);
        return;
      }

      setUndoDeadlineMs(nextDeadline);
    } catch {
      setUndoDeadlineMs(null);
    }
  }, []);

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();

    void refreshUsers();
    void refreshActivity();
    void refreshActionLog();
    void refreshSecurityMetrics();
    void refreshAdminStaff();
    void refreshScanModes();
    void refreshScanUndoState();

    return () => {
      controlsRef.current?.stop();
    };
  }, [refreshUsers, refreshActivity, refreshActionLog, refreshScanModes, refreshScanUndoState, refreshSecurityMetrics, refreshAdminStaff]);

  useEffect(() => {
    if (activeSection === "analytics") {
      void refreshActionLog();
      void refreshSecurityMetrics();
      void refreshAdminStaff();
    }
  }, [activeSection, refreshActionLog, refreshSecurityMetrics, refreshAdminStaff]);

  async function saveStaffScope(memberId: number) {
    const nextScope = staffScopeDrafts[memberId];
    if (!nextScope || savingStaffScopeId !== null) {
      return;
    }

    setSavingStaffScopeId(memberId);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetAdminId: memberId, scope: nextScope }),
      });

      const data = (await response.json().catch(() => null)) as StaffResponse | null;
      if (!response.ok || !data?.ok || !data.staff) {
        const errorMessage = data?.error ?? "No se pudo actualizar el scope";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setAdminStaff(data.staff);
      setStaffScopeDrafts((current) => {
        const next: Record<number, "admin" | "operator"> = { ...current };
        for (const member of data.staff ?? []) {
          next[member.id] = member.scope;
        }
        return next;
      });

      setError("");
      setMessage("Scope actualizado correctamente");
      toast.success("Scope actualizado");
      await refreshActivity();
      await refreshSecurityMetrics();
    } finally {
      setSavingStaffScopeId(null);
    }
  }

  async function createStaffMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingStaff) {
      return;
    }

    setCreatingStaff(true);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: newStaffEmail,
          whatsappPhone: newStaffWhatsapp,
          scope: newStaffScope,
        }),
      });

      const data = (await response.json().catch(() => null)) as StaffResponse | null;
      if (!response.ok || !data?.ok || !data.staff || !data.onboarding) {
        const errorMessage = data?.error ?? "No se pudo crear el miembro del staff";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setAdminStaff(data.staff);
      setStaffScopeDrafts((current) => {
        const next: Record<number, "admin" | "operator"> = { ...current };
        for (const member of data.staff ?? []) {
          next[member.id] = member.scope;
        }
        return next;
      });

      setNewStaffEmail("");
      setNewStaffWhatsapp("");
      setNewStaffScope("operator");
      setLastStaffOnboarding(data.onboarding);
      setError("");
      setMessage("Cuenta staff creada correctamente");
      toast.success("Cuenta staff creada");
      await refreshActivity();
      await refreshSecurityMetrics();
    } finally {
      setCreatingStaff(false);
    }
  }

  async function deleteStaffMember(memberId: number, memberEmail: string) {
    if (deletingStaffId !== null) {
      return;
    }

    const confirmed = window.confirm(`Vas a eliminar la cuenta staff ${memberEmail}. Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    setDeletingStaffId(memberId);

    try {
      const response = await fetch("/api/admin/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetAdminId: memberId }),
      });

      const data = (await response.json().catch(() => null)) as StaffResponse | null;
      if (!response.ok || !data?.ok || !data.staff) {
        const errorMessage = data?.error ?? "No se pudo eliminar la cuenta staff";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setAdminStaff(data.staff);
      setStaffScopeDrafts((current) => {
        const next: Record<number, "admin" | "operator"> = {};
        for (const member of data.staff ?? []) {
          next[member.id] = current[member.id] ?? member.scope;
        }
        return next;
      });

      setError("");
      setMessage("Cuenta staff eliminada correctamente");
      toast.success("Cuenta staff eliminada");
      await refreshActivity();
      await refreshSecurityMetrics();
    } finally {
      setDeletingStaffId(null);
    }
  }

  useEffect(() => {
    void refreshSelectedUserDailyUsage(selectedUser?.id ?? null);
  }, [selectedUser?.id, refreshSelectedUserDailyUsage]);

  useEffect(() => {
    if (!undoDeadlineMs) {
      setUndoSecondsLeft(0);
      return;
    }

    const updateRemaining = () => {
      const diffMs = undoDeadlineMs - Date.now();
      if (diffMs <= 0) {
        setUndoDeadlineMs(null);
        setUndoSecondsLeft(0);
        return;
      }

      setUndoSecondsLeft(Math.ceil(diffMs / 1000));
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [undoDeadlineMs]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLastOnboarding(null);
    setLastPasswordReset(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: createUserEmail,
        whatsappPhone: createUserWhatsapp,
        assignments: itemTypes.map((type) => ({
          itemTypeId: type.id,
          quantity: Math.max(0, Number(createAssignments[type.id] ?? 0)),
        })),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { user?: UserView; onboarding?: OnboardingData; error?: string }
      | null;

    if (!response.ok || !data?.user) {
      const errorMessage = data?.error ?? "No se pudo crear el usuario";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setCreateUserEmail("");
    setCreateUserWhatsapp("");
    setCreateAssignments(ensureValueMap(itemTypes, {}));
    setLastOnboarding(data.onboarding ?? null);
    setMessage(`Usuario ${data.user.username} creado.`);
    toast.success(`Usuario ${data.user.username} creado`);
    setActiveSection("create");
    await refreshUsers(data.user.id);
    await refreshActivity();
  }

  async function createItemType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch("/api/admin/item-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: newItemTypeName,
        initialQuantity: newItemTypeInitialQuantity,
        imageUrl: newItemTypeImageUrl.trim() || null,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { itemType?: ItemTypeView; error?: string }
      | null;

    if (!response.ok || !data?.itemType) {
      const errorMessage = data?.error ?? "No se pudo crear el tipo";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setNewItemTypeName("");
    setNewItemTypeInitialQuantity(0);
    setNewItemTypeImageUrl("");
    toast.success(`Tipo creado: ${data.itemType.name}`);
    await refreshUsers(selectedUser?.id ?? null);
    await refreshActivity();
  }

  async function uploadComponentImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona un archivo de imagen válido");
      return null;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2MB");
      return null;
    }

    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/admin/item-types/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const data = (await response.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;

    if (!response.ok || !data?.imageUrl) {
      toast.error(data?.error ?? "No se pudo subir la imagen");
      return null;
    }

    toast.success("Imagen subida correctamente");
    return data.imageUrl;
  }

  async function handleUploadNewComponentImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploadingNewComponentImage(true);
    try {
      const uploadedUrl = await uploadComponentImage(file);
      if (uploadedUrl) {
        setNewItemTypeImageUrl(uploadedUrl);
      }
    } finally {
      setUploadingNewComponentImage(false);
    }
  }

  async function handleUploadExistingComponentImage(itemTypeId: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploadingComponentImageById((current) => ({ ...current, [itemTypeId]: true }));
    try {
      const uploadedUrl = await uploadComponentImage(file);
      if (uploadedUrl) {
        setComponentImageUrls((current) => ({
          ...current,
          [itemTypeId]: uploadedUrl,
        }));
      }
    } finally {
      setUploadingComponentImageById((current) => ({ ...current, [itemTypeId]: false }));
    }
  }

  async function renameItemType(itemTypeId: number) {
    const nextName = (componentNames[itemTypeId] ?? "").trim();
    const nextImageUrl = (componentImageUrls[itemTypeId] ?? "").trim();
    const rawDailyLimit = (componentDailyLimits[itemTypeId] ?? "").trim();
    const parsedDailyLimit = rawDailyLimit === "" ? null : Number(rawDailyLimit);

    if (nextName.length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }

    if (!Number.isFinite(parsedDailyLimit === null ? 0 : parsedDailyLimit) || (parsedDailyLimit !== null && parsedDailyLimit < 0)) {
      toast.error("El límite diario debe ser un número válido");
      return;
    }

    if (parsedDailyLimit !== null && (parsedDailyLimit < 0 || parsedDailyLimit > 1000)) {
      toast.error("El límite diario debe estar entre 0 y 1000");
      return;
    }

    const response = await fetch("/api/admin/item-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        itemTypeId,
        name: nextName,
        imageUrl: nextImageUrl || null,
        dailyScanLimit: parsedDailyLimit,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { itemType?: ItemTypeView; error?: string }
      | null;

    if (!response.ok || !data?.itemType) {
      const errorMessage = data?.error ?? "No se pudo renombrar el componente";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    toast.success("Componente renombrado");
    await refreshUsers(selectedUser?.id ?? null);
    await refreshActivity();
  }

  async function deactivateItemType(itemTypeId: number) {
    const target = itemTypes.find((item) => item.id === itemTypeId);
    if (!target) {
      return;
    }

    const confirmed = window.confirm(`Vas a desactivar ${target.name}. Podrás seguir viendo datos históricos en auditoría.`);
    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/admin/item-types", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ itemTypeId }),
    });

    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      const errorMessage = data?.error ?? "No se pudo desactivar el componente";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    toast.success("Componente desactivado");
    await refreshUsers(selectedUser?.id ?? null);
    await refreshActivity();
  }

  async function findUserByToken(rawToken: string) {
    const token = normalizeToken(rawToken);

    if (!token) {
      setError("Escanea o pega un token QR válido");
      toast.error("Escanea o pega un token QR válido");
      return;
    }

    setError("");
    setMessage("");

    const now = Date.now();
    const lastScan = lastScanRef.current;
    if (lastScan && lastScan.token === token && now - lastScan.at < 1200) {
      return;
    }
    lastScanRef.current = { token, at: now };

    const response = await fetch("/api/admin/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });

    const data = (await response.json().catch(() => null)) as
      | { user?: UserView; error?: string }
      | null;

    if (!response.ok || !data?.user) {
      syncSelectedUser(null);
      const errorMessage = data?.error ?? "No se encontró usuario para ese QR";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    syncSelectedUser(data.user);
    mergeUser(data.user);
    setMessage(`Usuario cargado: ${data.user.username}`);
    toast.success(`Usuario cargado: ${data.user.username}`);
    setActiveSection("users");
  }

  async function applyModeByToken(rawToken: string) {
    const token = normalizeToken(rawToken);

    if (!token) {
      setError("Escanea o pega un token QR válido");
      toast.error("Escanea o pega un token QR válido");
      return;
    }

    if (!activeScanModeId) {
      setError("Selecciona un modo activo antes de escanear");
      toast.error("Selecciona un modo activo antes de escanear");
      return;
    }

    setError("");
    setMessage("");

    const now = Date.now();
    const lastScan = lastScanRef.current;
    if (lastScan && lastScan.token === token && now - lastScan.at < 1200) {
      return;
    }
    lastScanRef.current = { token, at: now };

    const response = await fetch("/api/admin/scan-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, modeId: activeScanModeId }),
    });

    const data = (await response.json().catch(() => null)) as ScanApplyResponse | null;

    if (!response.ok || !data?.user) {
      const errorMessage = data?.error ?? "No se pudo aplicar el modo de escaneo";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    syncSelectedUser(data.user);
    mergeUser(data.user);
    if (data.undoAvailableUntil) {
      const nextDeadline = new Date(data.undoAvailableUntil).getTime();
      if (Number.isFinite(nextDeadline)) {
        setUndoDeadlineMs(nextDeadline);
      }
    }
    setMessage(`Modo aplicado a ${data.user.username}`);
    toast.success(`Modo aplicado a ${data.user.username}`);
    await refreshUsers(data.user.id);
    await refreshSelectedUserDailyUsage(data.user.id);
    await refreshActivity();
  }

  async function undoLastScanApply() {
    if (undoingScan) {
      return;
    }

    setUndoingScan(true);

    try {
      const response = await fetch("/api/admin/scan-undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as ScanUndoResponse | null;

      if (!response.ok || !data?.user) {
        const errorMessage = data?.error ?? "No se pudo deshacer el ultimo escaneo";
        setUndoDeadlineMs(null);
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      mergeUser(data.user);
      syncSelectedUser(data.user);
      setUndoDeadlineMs(null);
      setMessage(`Escaneo revertido para ${data.user.username}`);
      setError("");
      toast.success("Ultimo escaneo revertido");
      await refreshUsers(data.user.id);
      await refreshSelectedUserDailyUsage(data.user.id);
      await refreshActivity();
    } finally {
      setUndoingScan(false);
    }
  }

  async function createScanMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch("/api/admin/scan-modes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: newScanModeName,
        startTime: newScanModeStartTime || null,
        endTime: newScanModeEndTime || null,
        items: itemTypes.map((type) => ({
          itemTypeId: type.id,
          operation: scanModeOps[type.id] ?? "add",
          quantity: Math.max(0, Number(scanModeQuantities[type.id] ?? 0)),
        })),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { mode?: ScanModeView; error?: string }
      | null;

    if (!response.ok || !data?.mode) {
      const errorMessage = data?.error ?? "No se pudo crear el modo";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setNewScanModeName("");
    setNewScanModeStartTime("");
    setNewScanModeEndTime("");
    setScanModeQuantities(ensureValueMap(itemTypes, {}));
    setScanModeOps(ensureOperationMap(itemTypes, {}));
    setActiveScanModeId(data.mode.id);
    toast.success(`Modo creado: ${data.mode.name}`);
    await refreshScanModes();
  }

  async function updateScanMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editModeId) {
      toast.error("Selecciona un modo para modificar");
      return;
    }

    const response = await fetch("/api/admin/scan-modes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        modeId: editModeId,
        name: editModeName,
        startTime: editModeStartTime || null,
        endTime: editModeEndTime || null,
        items: itemTypes.map((type) => ({
          itemTypeId: type.id,
          operation: editModeOps[type.id] ?? "add",
          quantity: Math.max(0, Number(editModeQuantities[type.id] ?? 0)),
        })),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { mode?: ScanModeView; error?: string }
      | null;

    if (!response.ok || !data?.mode) {
      const errorMessage = data?.error ?? "No se pudo modificar el modo";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    toast.success(`Modo actualizado: ${data.mode.name}`);
    await refreshScanModes();
  }

  async function toggleCamera(behavior: ScanBehavior) {
    if (!readerRef.current) {
      return;
    }

    if (cameraEnabled) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      processingScanRef.current = false;
      setCameraEnabled(false);
      if (scanBehavior === behavior) {
        return;
      }
    }

    if (!videoRef.current) {
      setError("No se pudo acceder al visor de cámara");
      toast.error("No se pudo acceder al visor de cámara");
      return;
    }

    setError("");
    setMessage("");
    setScanBehavior(behavior);
    processingScanRef.current = false;

    try {
      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        async (result) => {
          if (!result) {
            return;
          }

          const token = normalizeToken(result.getText());
          if (!token || processingScanRef.current) {
            return;
          }

          processingScanRef.current = true;
          controlsRef.current?.stop();
          controlsRef.current = null;
          setCameraEnabled(false);

          try {
            if (behavior === "mode") {
              await applyModeByToken(token);
              return;
            }

            await findUserByToken(token);
          } finally {
            processingScanRef.current = false;
          }
        },
      );
      setCameraEnabled(true);
      toast.success("Camara activada para escaneo");
    } catch {
      setError("No se pudo iniciar la cámara para escaneo QR");
      toast.error("No se pudo iniciar la cámara para escaneo QR");
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      toast.error("No tienes permisos para editar usuarios");
      return;
    }

    if (!selectedUser) {
      setError("Primero selecciona un usuario o escanea su token QR");
      toast.error("Primero selecciona un usuario o escanea su token QR");
      return;
    }

    setError("");
    setMessage("");

    const response = await fetch("/api/admin/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: selectedUser.id,
        mode: updateMode,
        itemQuantities: itemTypes.map((type) => ({
          itemTypeId: type.id,
          quantity: Math.max(0, Math.min(1000, Number(itemQuantities[type.id] ?? 0))),
        })),
        note,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { user?: UserView; error?: string }
      | null;

    if (!response.ok || !data?.user) {
      const errorMessage = data?.error ?? "No se pudo actualizar el usuario";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    mergeUser(data.user);
    syncSelectedUser(data.user);
    setMessage("Datos del usuario actualizados correctamente");
    toast.success("Datos del usuario actualizados");
    await refreshUsers(data.user.id);
    await refreshActivity();
  }

  function exportUsersCsv() {
    const header = ["email", ...itemTypes.map((item) => item.name), "total_unidades"];

    const rows = users.map((user) => [
      user.username,
      ...itemTypes.map((type) => {
        const found = user.items.find((item) => item.itemTypeId === type.id);
        return String(found?.quantity ?? 0);
      }),
      String(user.items.reduce((acc, item) => acc + item.quantity, 0)),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${value.replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `usuarios-qr-control-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  function applyQuickAdd(itemTypeId: number, amount: number) {
    setItemQuantities((current) => ({
      ...current,
      [itemTypeId]: Math.max(0, Math.min(1000, Number(current[itemTypeId] ?? 0) + amount)),
    }));
  }

  async function resetSelectedUserPassword() {
    if (!selectedUser) {
      toast.error("Selecciona un usuario para resetear contraseña");
      return;
    }

    const response = await fetch("/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId: selectedUser.id, whatsappPhone: resetWhatsappPhone }),
    });

    const data = (await response.json().catch(() => null)) as
      | { onboarding?: OnboardingData; error?: string }
      | null;

    if (!response.ok || !data?.onboarding) {
      const errorMessage = data?.error ?? "No se pudo resetear la contraseña";
      toast.error(errorMessage);
      setError(errorMessage);
      return;
    }

    setLastPasswordReset(data.onboarding);
    setError("");
    setMessage(`Enlace de restablecimiento generado para ${selectedUser.username}`);
    toast.success("Enlace de restablecimiento generado");
    await refreshActivity();
  }

  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(deferredSearch.trim().toLowerCase()),
  );
  const filteredItemTypes = itemTypes.filter((type) =>
    type.name.toLowerCase().includes(deferredComponentSearch.trim().toLowerCase()),
  );
  const dirtyComponentIds = new Set(
    itemTypes
      .filter((type) => {
        const nextName = (componentNames[type.id] ?? type.name).trim();
        const nextImageUrl = (componentImageUrls[type.id] ?? type.imageUrl ?? "").trim();
        const nextDailyLimitRaw = (componentDailyLimits[type.id] ?? "").trim();
        const nextDailyLimit = nextDailyLimitRaw === "" ? null : Number(nextDailyLimitRaw);
        const currentDailyLimit = typeof type.dailyScanLimit === "number" && type.dailyScanLimit > 0
          ? type.dailyScanLimit
          : null;
        const currentImageUrl = (type.imageUrl ?? "").trim();

        return nextName !== type.name || nextImageUrl !== currentImageUrl || nextDailyLimit !== currentDailyLimit;
      })
      .map((type) => type.id),
  );

  function handleSelectUser(user: UserView | null) {
    syncSelectedUser(user);
    setLastPasswordReset(null);
    if (user) {
      setActiveSection("users");
    }
  }

  async function deleteSelectedUser() {
    if (!selectedUser) {
      toast.error("Selecciona un usuario antes de borrar");
      return;
    }

    const confirmed = window.confirm(`Vas a borrar a ${selectedUser.username}. Esta acción no se puede deshacer.`);

    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId: selectedUser.id }),
    });

    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      const errorMessage = data?.error ?? "No se pudo borrar el usuario";
      toast.error(errorMessage);
      setError(errorMessage);
      return;
    }

    toast.success("Usuario eliminado");
    setMessage("Usuario eliminado correctamente");
    setError("");
    setLastOnboarding(null);
    setLastPasswordReset(null);
    syncSelectedUser(null);
    await refreshUsers();
    await refreshActivity();
  }

  async function resetManagedData() {
    const confirmed = window.confirm(
      "Se borrarán todos los usuarios creados, sus saldos, los modos de escaneo y la actividad registrada. El admin y los componentes activos se conservarán.",
    );

    if (!confirmed) {
      return;
    }

    setResettingData(true);

    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as ResetResponse | null;

      if (!response.ok || !data?.ok) {
        const errorMessage = data?.error ?? "No se pudieron limpiar los datos actuales";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setLastOnboarding(null);
      setLastPasswordReset(null);
      setManualToken("");
      setResetWhatsappPhone("");
      syncSelectedUser(null);

      await refreshUsers();
      await refreshScanModes();
      await refreshActivity();

      const result = data.result;
      const summaryMessage = `Datos reiniciados: ${result.deletedUserCount} usuarios, ${result.deletedModeCount} modos y ${result.deletedLogCount} movimientos eliminados.`;
      setMessage(summaryMessage);
      setError("");
      toast.success("Datos de prueba limpiados");
    } finally {
      setResettingData(false);
    }
  }

  async function applyBulkUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!bulkItemTypeId) {
      setError("Selecciona un tipo de dato para aplicar el ajuste");
      toast.error("Selecciona un tipo de dato para aplicar el ajuste");
      return;
    }

    if (bulkMode === "add" && bulkQuantity === 0) {
      setError("La cantidad a sumar debe ser mayor que 0");
      toast.error("La cantidad a sumar debe ser mayor que 0");
      return;
    }

    const response = await fetch("/api/admin/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ itemTypeId: bulkItemTypeId, mode: bulkMode, quantity: bulkQuantity }),
    });

    const data = (await response.json().catch(() => null)) as { updatedUsers?: number; error?: string } | null;

    if (!response.ok || !data) {
      const errorMessage = data?.error ?? "No se pudo aplicar el ajuste masivo";
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setMessage(`Ajuste aplicado a ${data.updatedUsers ?? 0} usuarios`);
    toast.success("Ajuste global aplicado");
    setBulkQuantity(0);
    await refreshUsers(selectedUser?.id ?? null);
    await refreshActivity();
  }

  const moduleTabs = useMemo(() => {
    const tabs: Array<{
      id: AdminSection;
      label: string;
      Icon: typeof Users01Icon;
      count?: number;
      tooltip: string;
    }> = [];

    if (canRead) {
      tabs.push({ id: "users", label: "Usuarios", Icon: Users01Icon, count: users.length, tooltip: "Gestion y edicion de usuarios" });
    }
    if (canScan) {
      tabs.push({ id: "scan", label: "Escanear", Icon: Camera01Icon, tooltip: "Escaneo rapido por QR" });
    }
    if (canManage) {
      tabs.push({ id: "components", label: "Componentes", Icon: PuzzlePiece01Icon, count: itemTypes.length, tooltip: "Catalogo de componentes" });
    }
    if (canExecuteModes) {
      tabs.push({ id: "modes", label: "Modos", Icon: Dataflow03Icon, tooltip: "Flujos de escaneo y aplicacion" });
    }
    if (canManage) {
      tabs.push({ id: "create", label: "Alta", Icon: Mail01Icon, tooltip: "Alta de nuevos usuarios" });
    }
    if (canRead) {
      tabs.push({ id: "analytics", label: "Datos", Icon: BarChartSquare02Icon, tooltip: "Analitica y tendencias generales" });
    }

    return tabs;
  }, [canExecuteModes, canManage, canRead, canScan, itemTypes.length, users.length]);

  useEffect(() => {
    if (moduleTabs.length === 0) {
      return;
    }

    if (!moduleTabs.some((tab) => tab.id === activeSection)) {
      setActiveSection(moduleTabs[0].id);
    }
  }, [activeSection, moduleTabs]);

  const denseBottomBar = moduleTabs.length >= 6 || itemTypes.length >= 8;
  const formatTabCount = (value: number) => (value > 99 ? "99+" : String(value));
  const clearHoldLabelTimer = () => {
    if (holdLabelTimeoutRef.current) {
      clearTimeout(holdLabelTimeoutRef.current);
      holdLabelTimeoutRef.current = null;
    }
  };
  const startHoldLabel = (tabId: AdminSection) => {
    clearHoldLabelTimer();
    holdLabelTimeoutRef.current = setTimeout(() => {
      setHeldTabId(tabId);
    }, 260);
  };
  const stopHoldLabel = () => {
    clearHoldLabelTimer();
    setHeldTabId(null);
  };
  const bottomBarStyle = {
    "--module-count": moduleTabs.length,
  } as CSSProperties;
  const itemTotals = itemTypes
    .map((type) => ({
      id: type.id,
      name: type.name,
      total: users.reduce(
        (acc, user) => acc + (user.items.find((item) => item.itemTypeId === type.id)?.quantity ?? 0),
        0,
      ),
    }))
    .sort((left, right) => right.total - left.total);
  const maxItemTotal = Math.max(1, ...itemTotals.map((item) => item.total));
  const totalsByUser = users.map((user) => ({
    id: user.id,
    username: user.username,
    total: user.items.reduce((acc, item) => acc + item.quantity, 0),
  }));
  const topUsers = [...totalsByUser].sort((left, right) => right.total - left.total).slice(0, 5);
  const maxUserTotal = Math.max(1, ...topUsers.map((user) => user.total));
  const distributionBuckets = [
    { label: "0", count: totalsByUser.filter((user) => user.total === 0).length },
    { label: "1-2", count: totalsByUser.filter((user) => user.total >= 1 && user.total <= 2).length },
    { label: "3-5", count: totalsByUser.filter((user) => user.total >= 3 && user.total <= 5).length },
    { label: "6+", count: totalsByUser.filter((user) => user.total >= 6).length },
  ];
  const maxBucketCount = Math.max(1, ...distributionBuckets.map((bucket) => bucket.count));
  const selectedModeForScan = scanModes.find((mode) => mode.id === activeScanModeId) ?? null;
  const modesScheduleSummary = scanModes
    .map((mode) => {
      const hasSchedule = Boolean(mode.startTime && mode.endTime);
      const scheduleText = hasSchedule
        ? `${mode.startTime} - ${mode.endTime}`
        : "Todo el día";

      return {
        id: mode.id,
        name: mode.name,
        scheduleText,
        isActiveNow: isScheduleActiveNow(mode.startTime, mode.endTime),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "es"));

  const selectedModeLimitItems = (selectedModeForScan?.items ?? []).map((entry) => {
    const currentType = itemTypes.find((type) => type.id === entry.itemTypeId);
    const usedToday = Math.max(0, dailyUsageByItemType[entry.itemTypeId] ?? 0);
    const dailyLimit =
      typeof currentType?.dailyScanLimit === "number" && currentType.dailyScanLimit > 0
        ? currentType.dailyScanLimit
        : null;
    const remainingToday = typeof dailyLimit === "number" ? Math.max(0, dailyLimit - usedToday) : null;

    return {
      ...entry,
      dailyScanLimit: dailyLimit,
      usedToday,
      remainingToday,
      willExceed: entry.operation === "remove" && remainingToday !== null && entry.quantity > remainingToday,
    };
  });

  return (
    <section className="form-grid" aria-busy={loadingUsers}>
      <div className="form-grid" aria-live="polite" aria-atomic="true">
        {message ? <p className="ok">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}

        {activeSection === "analytics" ? (
          <article className="card form-grid module-panel analytics-panel" id="admin-section-analytics">
            <div className="section-heading">
              <h2 className="subtitle step-title">Datos generales</h2>
            </div>

            <section className="analytics-grid">
              <article className="soft-box secondary-panel chart-card">
                <div className="chart-card-head">
                  <span className="chart-title">Componentes</span>
                  <strong>{itemTypes.length}</strong>
                </div>
                <div className="bar-chart-list" role="img" aria-label="Distribucion total por componente">
                  {itemTotals.length === 0 ? (
                    <p className="muted">Sin datos.</p>
                  ) : (
                    itemTotals.slice(0, 6).map((item) => (
                      <div key={item.id} className="bar-chart-row">
                        <span className="bar-chart-label">{item.name}</span>
                        <div className="bar-chart-track">
                          <div className="bar-chart-fill" style={{ width: `${Math.round((item.total / maxItemTotal) * 100)}%` }} />
                        </div>
                        <span className="bar-chart-value">{item.total}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="soft-box secondary-panel chart-card">
                <div className="chart-card-head">
                  <span className="chart-title">Carga</span>
                  <strong>{summary.totalUsers}</strong>
                </div>
                <div className="bar-chart-list" role="img" aria-label="Usuarios agrupados por carga total">
                  {distributionBuckets.map((bucket) => (
                    <div key={bucket.label} className="bar-chart-row compact-bar-row">
                      <span className="bar-chart-label">{bucket.label}</span>
                      <div className="bar-chart-track">
                        <div className="bar-chart-fill neutral-bar-fill" style={{ width: `${Math.round((bucket.count / maxBucketCount) * 100)}%` }} />
                      </div>
                      <span className="bar-chart-value">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="soft-box secondary-panel chart-card analytics-wide-card">
                <div className="chart-card-head">
                  <span className="chart-title">Top usuarios</span>
                  <strong>{summary.totalUnits}</strong>
                </div>
                <div className="bar-chart-list" role="img" aria-label="Usuarios con mayor cantidad total">
                  {topUsers.length === 0 ? (
                    <p className="muted">Sin datos.</p>
                  ) : (
                    topUsers.map((user) => (
                      <div key={user.id} className="bar-chart-row">
                        <span className="bar-chart-label">{user.username}</span>
                        <div className="bar-chart-track">
                          <div className="bar-chart-fill accent-bar-fill" style={{ width: `${Math.round((user.total / maxUserTotal) * 100)}%` }} />
                        </div>
                        <span className="bar-chart-value">{user.total}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <details className="soft-box activity-disclosure secondary-panel analytics-wide-card" open>
                <summary className="activity-summary">
                  <span className="btn-inline">
                    <ChevronDownIcon width={14} height={14} />
                    Seguridad y denegaciones
                  </span>
                </summary>
                <div className="form-grid activity-panel">
                  <div className="security-kpi-grid" role="list" aria-label="Resumen de denegaciones de seguridad">
                    <div className="security-kpi-card" role="listitem">
                      <span>Total (7 dias)</span>
                      <strong>{securityMetrics.totalDenied}</strong>
                    </div>
                    <div className="security-kpi-card" role="listitem">
                      <span>Ultimas 24h</span>
                      <strong>{securityMetrics.last24hDenied}</strong>
                    </div>
                    <div className="security-kpi-card" role="listitem">
                      <span>Endpoints afectados</span>
                      <strong>{securityMetrics.byEndpoint.length}</strong>
                    </div>
                  </div>

                  <div className="security-denied-grid">
                    <div className="soft-box secondary-panel security-block">
                      <p className="muted">Evolucion diaria</p>
                      {securityMetrics.byDay.length === 0 ? (
                        <p className="muted">Sin denegaciones en la ventana actual.</p>
                      ) : (
                        <div className="security-row-list" role="list">
                          {securityMetrics.byDay.map((entry) => (
                            <div key={`denied-day-row-${entry.day}`} className="security-row" role="listitem">
                              <span>{entry.day}</span>
                              <strong>{entry.count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="soft-box secondary-panel security-block">
                      <p className="muted">Endpoints con mas bloqueos</p>
                      {securityMetrics.byEndpoint.length === 0 ? (
                        <p className="muted">Sin endpoints bloqueados.</p>
                      ) : (
                        <div className="security-row-list" role="list">
                          {securityMetrics.byEndpoint.slice(0, 8).map((entry) => (
                            <div key={`denied-endpoint-row-${entry.pathname}`} className="security-row" role="listitem">
                              <span title={entry.pathname}>{entry.pathname}</span>
                              <strong>{entry.count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </details>

              <details className="soft-box activity-disclosure secondary-panel analytics-wide-card">
                <summary className="activity-summary">
                  <span className="btn-inline">
                    <ChevronDownIcon width={14} height={14} />
                    Log de acciones
                  </span>
                </summary>
                <div className="form-grid activity-panel">
                  {actionLog.length === 0 ? (
                    <p className="muted">No hay acciones registradas todavía.</p>
                  ) : (
                    <div className="action-log-list" role="list" aria-label="Registro completo de acciones">
                      {actionLog.map((item) => (
                        <div key={`action-log-${item.id}`} className="action-log-row" role="listitem">
                          <div className="action-log-head">
                            <strong>{item.action}</strong>
                            <span>{formatActivityDate(item.createdAt)}</span>
                          </div>
                          <span>{`${item.actorEmail} -> ${item.targetEmail}`}</span>
                          <small>{formatActivityDetails(item.details)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              {canManage ? (
                <article className="soft-box secondary-panel chart-card analytics-wide-card">
                  <div className="chart-card-head">
                    <span className="chart-title">Equipo admin</span>
                    <strong>{adminStaff.length}</strong>
                  </div>

                  <div className="module-disclosure-stack">
                    <details className="soft-box activity-disclosure secondary-panel">
                      <summary className="activity-summary">
                        <span className="btn-inline">
                          <ChevronDownIcon width={14} height={14} />
                          Crear miembro staff
                        </span>
                      </summary>
                      <div className="form-grid activity-panel">
                        <form className="form-grid" onSubmit={createStaffMember}>
                          <div className="grid-2">
                            <label className="field">
                              <span>Correo staff</span>
                              <input
                                type="email"
                                value={newStaffEmail}
                                onChange={(event) => setNewStaffEmail(event.target.value)}
                                maxLength={120}
                                required
                              />
                            </label>
                            <label className="field">
                              <span>WhatsApp (opcional)</span>
                              <input
                                inputMode="tel"
                                value={newStaffWhatsapp}
                                onChange={(event) => setNewStaffWhatsapp(event.target.value)}
                                maxLength={30}
                              />
                            </label>
                            <label className="field">
                              <span>Scope inicial</span>
                              <select
                                value={newStaffScope}
                                onChange={(event) => setNewStaffScope(event.target.value as "admin" | "operator")}
                              >
                                <option value="operator">operator</option>
                                <option value="admin">admin</option>
                              </select>
                            </label>
                          </div>
                          <button className="btn-secondary" type="submit" disabled={creatingStaff}>
                            <span className="btn-inline">
                              <Users01Icon width={14} height={14} />
                              {creatingStaff ? "Creando..." : "Crear staff"}
                            </span>
                          </button>
                        </form>

                        {lastStaffOnboarding ? (
                          <div className="soft-box form-grid secondary-panel">
                            <p className="muted">Enlace de configuracion staff</p>
                            <strong>{lastStaffOnboarding.setupLink}</strong>
                            {lastStaffOnboarding.expiresAt ? <small className="muted">Caduca: {lastStaffOnboarding.expiresAt}</small> : null}
                            <div className="action-grid">
                              <a className="btn-secondary" href={lastStaffOnboarding.mailtoLink}>
                                <span className="btn-inline">
                                  <Mail01Icon width={14} height={14} />
                                  Enviar por mailto
                                </span>
                              </a>
                              {lastStaffOnboarding.whatsappLink ? (
                                <a className="btn-secondary" href={lastStaffOnboarding.whatsappLink} target="_blank" rel="noreferrer">
                                  <span className="btn-inline">
                                    <MessageChatCircleIcon width={14} height={14} />
                                    Enviar por WhatsApp
                                  </span>
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>

                  <div className="admin-staff-grid" role="list" aria-label="Scopes del equipo admin">
                    {adminStaff.length === 0 ? (
                      <p className="muted">No hay cuentas admin disponibles.</p>
                    ) : (
                      adminStaff.map((member) => {
                        const draftScope = staffScopeDrafts[member.id] ?? member.scope;
                        const isSelf = member.id === currentAdminId;
                        const isDirty = draftScope !== member.scope;

                        return (
                          <details key={`staff-${member.id}`} className="admin-staff-card" role="listitem">
                            <summary className="admin-staff-summary">
                              <div className="admin-staff-summary-main">
                                <strong>{member.username}</strong>
                                <span>{isSelf ? "Tu cuenta" : "Cuenta de staff"}</span>
                              </div>
                              <div className="admin-staff-meta">
                                <span className="pill">{member.scope}</span>
                                <ChevronDownIcon width={16} height={16} />
                              </div>
                            </summary>
                            <div className="admin-staff-controls">
                              <label className="field">
                                <span>Scope</span>
                                <select
                                  value={draftScope}
                                  disabled={isSelf || savingStaffScopeId === member.id}
                                  onChange={(event) =>
                                    setStaffScopeDrafts((current) => ({
                                      ...current,
                                      [member.id]: event.target.value as "admin" | "operator",
                                    }))
                                  }
                                >
                                  <option value="admin">admin</option>
                                  <option value="operator">operator</option>
                                </select>
                              </label>
                              <div className="module-actions-inline">
                                <button
                                  className="btn-quiet"
                                  type="button"
                                  disabled={isSelf || !isDirty || savingStaffScopeId === member.id || deletingStaffId === member.id}
                                  onClick={() => void saveStaffScope(member.id)}
                                >
                                  <span className="btn-inline">
                                    <Save01Icon width={14} height={14} />
                                    {savingStaffScopeId === member.id ? "Guardando..." : "Guardar"}
                                  </span>
                                </button>
                                <button
                                  className="btn-danger"
                                  type="button"
                                  disabled={isSelf || savingStaffScopeId === member.id || deletingStaffId === member.id}
                                  onClick={() => void deleteStaffMember(member.id, member.username)}
                                >
                                  <span className="btn-inline">
                                    <Trash01Icon width={14} height={14} />
                                    {deletingStaffId === member.id ? "Eliminando..." : "Eliminar"}
                                  </span>
                                </button>
                              </div>
                              {isSelf ? <span className="muted">Tu cuenta no se puede editar ni eliminar desde aqui.</span> : null}
                            </div>
                          </details>
                        );
                      })
                    )}
                  </div>
                </article>
              ) : null}
            </section>

            <details className="soft-box activity-disclosure secondary-panel">
              <summary className="activity-summary">
                <span className="btn-inline">
                  <ChevronDownIcon width={14} height={14} />
                  Acciones globales
                </span>
              </summary>

              <div className="form-grid activity-panel">
                <div className="grid-2">
                  <label className="field">
                    <span>Acción</span>
                    <select
                      value={activityFilter.action}
                      onChange={(event) =>
                        setActivityFilter((current) => ({
                          ...current,
                          action: event.target.value,
                        }))
                      }
                    >
                      <option value="">Todas</option>
                      <option value="ADMIN_PERMISSION_DENIED">Denegaciones de permiso</option>
                      <option value="USER_DELETE">Borrado de usuario</option>
                      <option value="USER_UPDATE">Actualizacion de usuario</option>
                      <option value="USER_PASSWORD_RESET">Reset de contrasena</option>
                      <option value="USERS_BULK_TICKET_UPDATE">Ajuste masivo</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Desde</span>
                    <input
                      type="date"
                      value={activityFilter.dateFrom}
                      onChange={(event) =>
                        setActivityFilter((current) => ({
                          ...current,
                          dateFrom: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Hasta</span>
                    <input
                      type="date"
                      value={activityFilter.dateTo}
                      onChange={(event) =>
                        setActivityFilter((current) => ({
                          ...current,
                          dateTo: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="module-actions-inline">
                  <button className="btn-quiet" type="button" onClick={() => void refreshActivity()}>
                    <span className="btn-inline">
                      <RefreshCw01Icon width={14} height={14} />
                      Aplicar filtros
                    </span>
                  </button>
                  <button
                    className="btn-quiet"
                    type="button"
                    onClick={() => {
                      const resetFilter = { action: "", dateFrom: "", dateTo: "" };
                      setActivityFilter(resetFilter);
                      void refreshActivity(resetFilter);
                    }}
                  >
                    <span className="btn-inline">
                      <Trash01Icon width={14} height={14} />
                      Limpiar filtros
                    </span>
                  </button>
                </div>

                {canManage ? (
                <form className="form-grid" onSubmit={applyBulkUpdate}>
                  <div className="grid-2">
                    <label className="field">
                      <span>Componente</span>
                      <select
                        value={bulkItemTypeId ?? ""}
                        onChange={(event) => setBulkItemTypeId(Number(event.target.value))}
                        required
                      >
                        {itemTypes.map((type) => (
                          <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Modo</span>
                      <select
                        value={bulkMode}
                        onChange={(event) => setBulkMode(event.target.value as "add" | "set")}
                      >
                        <option value="add">Anadir</option>
                        <option value="set">Fijar</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Cantidad</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={bulkQuantity}
                        onChange={(event) => setBulkQuantity(Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <div className="module-actions-inline">
                    <button className="btn-secondary" type="submit" title="Aplicar cambios a todos los usuarios" aria-label="Aplicar cambios a todos los usuarios">
                      <span className="btn-inline">
                        <Dataflow03Icon width={14} height={14} />
                        Aplicar a todos
                      </span>
                    </button>
                    <button className="btn-quiet" type="button" onClick={exportUsersCsv} title="Exportar usuarios CSV" aria-label="Exportar usuarios CSV">
                      <span className="btn-inline">
                        <Download01Icon width={14} height={14} />
                        Exportar CSV
                      </span>
                    </button>
                    <button className="btn-danger" type="button" onClick={() => void resetManagedData()} disabled={resettingData} title="Borrar usuarios, movimientos y modos de escaneo" aria-label="Borrar usuarios, movimientos y modos de escaneo">
                      <span className="btn-inline">
                        <Trash01Icon width={14} height={14} />
                        {resettingData ? "Limpiando datos" : "Limpiar datos de prueba"}
                      </span>
                    </button>
                  </div>
                </form>
                ) : (
                  <button className="btn-quiet" type="button" onClick={exportUsersCsv} title="Exportar usuarios CSV" aria-label="Exportar usuarios CSV">
                    <span className="btn-inline">
                      <Download01Icon width={14} height={14} />
                      Exportar CSV
                    </span>
                  </button>
                )}

                {activity.length === 0 ? (
                  <p className="muted">Sin actividad reciente.</p>
                ) : (
                  <div className="activity-list">
                    {activity.slice(0, 6).map((item) => (
                      <div key={item.id} className="activity-row">
                        <strong>{item.action}</strong>
                        <span>{`${item.actorEmail} -> ${item.targetEmail}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </article>
        ) : null}

        {activeSection === "components" && canManage ? (
          <article className="card form-grid module-panel" id="admin-section-components">
            <div className="component-toolbar">
              <div>
                <h2 className="subtitle step-title">Componentes</h2>
                <p className="module-subtitle">Edita rapido los existentes y crea nuevos solo cuando lo necesites.</p>
              </div>
              <span className="pill">{filteredItemTypes.length}/{itemTypes.length}</span>
            </div>

            <details className="soft-box activity-disclosure secondary-panel">
              <summary className="activity-summary">
                <span className="btn-inline">
                  <ChevronDownIcon width={14} height={14} />
                  Editar componentes existentes
                </span>
              </summary>
              <div className="form-grid activity-panel">
                <label className="field search-field-minimal component-search-field">
                  <input
                    aria-label="Buscar componente"
                    value={componentSearch}
                    onChange={(event) => setComponentSearch(event.target.value)}
                    placeholder="Buscar componente"
                  />
                </label>

                <div className="soft-box secondary-panel component-hint-box">
                  <p className="muted">Pulsa Editar para guardar nombre, imagen y límite diario (vacío = sin límite).</p>
                </div>

                <div className="soft-box form-grid secondary-panel">
                  {itemTypes.length === 0 ? (
                    <p className="muted">No hay componentes creados.</p>
                  ) : filteredItemTypes.length === 0 ? (
                    <p className="muted">No hay componentes que coincidan con la búsqueda.</p>
                  ) : (
                    <div className="component-list component-list-compact">
                      {filteredItemTypes.map((type) => {
                        const isDirty = dirtyComponentIds.has(type.id);
                        const previewImageUrl = (componentImageUrls[type.id] ?? type.imageUrl ?? "").trim();

                        return (
                        <div key={type.id} className={isDirty ? "component-row component-row-compact component-row-dirty" : "component-row component-row-compact"}>
                          <div className="component-main">
                            <div className="component-head">
                              <span className="pill">#{type.id}</span>
                              {previewImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  className="component-image-preview"
                                  src={previewImageUrl}
                                  alt={`Imagen del componente ${type.name}`}
                                  loading="lazy"
                                />
                              ) : (
                                <span className="component-image-fallback" aria-hidden="true">
                                  <Ticket01Icon width={16} height={16} />
                                </span>
                              )}
                            </div>
                            <label className="field component-name-field">
                              <input
                                value={componentNames[type.id] ?? type.name}
                                onChange={(event) =>
                                  setComponentNames((current) => ({
                                    ...current,
                                    [type.id]: event.target.value,
                                  }))
                                }
                                minLength={2}
                                maxLength={40}
                                aria-label={`Nombre del componente ${type.name}`}
                              />
                            </label>
                            <label className="field component-name-field">
                              <input
                                value={componentImageUrls[type.id] ?? type.imageUrl ?? ""}
                                onChange={(event) =>
                                  setComponentImageUrls((current) => ({
                                    ...current,
                                    [type.id]: event.target.value,
                                  }))
                                }
                                maxLength={2048}
                                placeholder="URL de imagen (opcional)"
                                aria-label={`URL de imagen para ${type.name}`}
                              />
                            </label>
                            <label className="field component-upload-field">
                              <span>Subir imagen</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={(event) => void handleUploadExistingComponentImage(type.id, event)}
                                aria-label={`Subir imagen para ${type.name}`}
                                disabled={Boolean(uploadingComponentImageById[type.id])}
                              />
                            </label>
                            <label className="field component-name-field">
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                value={componentDailyLimits[type.id] ?? ""}
                                onChange={(event) =>
                                  setComponentDailyLimits((current) => ({
                                    ...current,
                                    [type.id]: event.target.value,
                                  }))
                                }
                                placeholder="Sin limite diario"
                                aria-label={`Límite diario para ${type.name}`}
                              />
                            </label>
                            <span className={isDirty ? "component-status component-status-dirty" : "component-status"}>{isDirty ? "Editado" : "Sin cambios"}</span>
                          </div>
                          <div className="component-row-actions component-actions-small">
                            <button className="btn-quiet" type="button" onClick={() => void renameItemType(type.id)} title={`Editar componente ${type.name}`} aria-label={`Editar componente ${type.name}`} disabled={!isDirty}>
                              <span className="btn-inline">
                                <Edit03Icon width={14} height={14} />
                                Editar
                              </span>
                            </button>
                            <button className="btn-danger btn-danger-small" type="button" onClick={() => void deactivateItemType(type.id)} title={`Eliminar componente ${type.name}`} aria-label={`Eliminar componente ${type.name}`}>
                              <span className="btn-inline">
                                <Trash01Icon width={14} height={14} />
                                Eliminar
                              </span>
                            </button>
                          </div>
                        </div>
                      );})}
                    </div>
                  )}
                </div>
              </div>
            </details>

            <details className="soft-box activity-disclosure secondary-panel">
              <summary className="activity-summary">
                <span className="btn-inline">
                  <ChevronDownIcon width={14} height={14} />
                  Nuevo componente
                </span>
              </summary>
              <form className="form-grid activity-panel" onSubmit={createItemType}>
                <div className="grid-2">
                  <label className="field">
                    <span>Nombre</span>
                    <input
                      value={newItemTypeName}
                      onChange={(event) => setNewItemTypeName(event.target.value)}
                      minLength={2}
                      maxLength={40}
                      placeholder="Nuevo componente"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>URL de imagen</span>
                    <input
                      value={newItemTypeImageUrl}
                      onChange={(event) => setNewItemTypeImageUrl(event.target.value)}
                      maxLength={2048}
                      placeholder="https://... (opcional)"
                    />
                  </label>
                  <label className="field">
                    <span>Subir imagen</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => void handleUploadNewComponentImage(event)}
                      disabled={uploadingNewComponentImage}
                    />
                  </label>
                  <label className="field">
                    <span>Inicial</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={newItemTypeInitialQuantity}
                      onChange={(event) => setNewItemTypeInitialQuantity(Number(event.target.value))}
                    />
                  </label>
                </div>
                <div className="module-actions-inline">
                  <button className="btn-primary" type="submit" title="Crear componente" aria-label="Crear componente">
                    <span className="btn-inline">
                      <PuzzlePiece01Icon width={14} height={14} />
                      Crear componente
                    </span>
                  </button>
                </div>
              </form>
            </details>
          </article>
        ) : null}

        {activeSection === "users" ? (
          <section id="admin-section-users" className="module-panel users-workspace">
            <div className="users-pane-list">
              <AdminUserList
                users={filteredUsers}
                selectedUserId={selectedUser?.id ?? null}
                search={search}
                onSearchChange={setSearch}
                onSelectUser={handleSelectUser}
              />
            </div>

            <article className="card form-grid users-pane-edit" id="admin-section-users-edit">
              <div className="section-heading">
                <div>
                  <h2 className="subtitle step-title">Usuario</h2>
                </div>
                <span className="pill">{selectedUser ? "Activo" : "--"}</span>
              </div>

              {selectedUser ? (
                <div className="selected-user-card">
                  <div>
                    <p className="muted">Correo</p>
                    <strong>{selectedUser.username}</strong>
                  </div>
                  <div>
                    <p className="muted">Componentes</p>
                    <div className="selected-user-items" role="list" aria-label="Componentes del usuario">
                      {selectedUser.items.map((item) => (
                        <div key={`selected-user-item-${item.itemTypeId}`} className="selected-user-item" role="listitem">
                          <span>{item.itemName}</span>
                          <strong>{item.quantity}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p className="muted">No hay ningún usuario seleccionado.</p>
                </div>
              )}

              {!canManage ? (
                <div className="soft-box secondary-panel">
                  <p className="muted">Modo solo lectura: este perfil puede consultar datos, pero no editar usuarios.</p>
                </div>
              ) : null}

              <details className="soft-box activity-disclosure secondary-panel">
                <summary className="activity-summary">
                  <span className="btn-inline">
                    <ChevronDownIcon width={14} height={14} />
                    Ajustes del usuario
                  </span>
                </summary>
                <div className="form-grid activity-panel">
                  <form ref={updateFormRef} className="form-grid" onSubmit={updateUser}>
                    <label className="field">
                      <span>Modo de ajuste</span>
                      <select
                        value={updateMode}
                        onChange={(event) => setUpdateMode(event.target.value as "add" | "set")}
                        disabled={!canManage}
                      >
                        <option value="add">Anadir cantidad</option>
                        <option value="set">Establecer cantidad</option>
                      </select>
                    </label>

                    <div className="quick-actions">
                      {itemTypes.map((type) => (
                        <button key={type.id} className="quick-btn" type="button" onClick={() => applyQuickAdd(type.id, 1)} title={`Sumar 1 a ${type.name}`} aria-label={`Sumar 1 a ${type.name}`} disabled={!canManage}>
                          <span className="btn-inline">
                            <Ticket01Icon width={14} height={14} />
                            +1 {type.name}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="grid-2">
                      {itemTypes.map((type) => (
                        <label className="field" key={type.id}>
                          <span>Cantidad {type.name}</span>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={itemQuantities[type.id] ?? 0}
                            disabled={!canManage}
                            onChange={(e) =>
                              setItemQuantities((current) => ({
                                ...current,
                                [type.id]: Number(e.target.value),
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>

                    <label className="field">
                      <span>Nota interna</span>
                      <textarea
                        value={note}
                        disabled={!canManage}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        maxLength={300}
                        placeholder="Ejemplo: usuario vino fuera de horario"
                      />
                    </label>

                    <label className="field">
                      <span>WhatsApp para enviar enlace (opcional)</span>
                      <div className="input-with-icon">
                        <MessageChatCircleIcon width={16} height={16} />
                        <input
                          inputMode="tel"
                          value={resetWhatsappPhone}
                          disabled={!canManage}
                          onChange={(e) => setResetWhatsappPhone(e.target.value)}
                          maxLength={30}
                          placeholder="34600111222"
                        />
                      </div>
                    </label>

                    <button className="btn-primary" disabled={!canManage || !selectedUser} title="Guardar cambios del usuario" aria-label="Guardar cambios del usuario">
                      <span className="btn-inline">
                        <Dataflow03Icon width={14} height={14} />
                        Guardar cambios del usuario
                      </span>
                    </button>

                    <details className="soft-box activity-disclosure secondary-panel">
                      <summary className="activity-summary">
                        <span className="btn-inline">
                          <ChevronDownIcon width={14} height={14} />
                          Acciones avanzadas
                        </span>
                      </summary>
                      <div className="form-grid activity-panel">
                        <button className="btn-secondary" type="button" disabled={!canManage || !selectedUser} onClick={() => void resetSelectedUserPassword()} title="Generar enlace seguro de restablecimiento" aria-label="Generar enlace seguro de restablecimiento">
                          <span className="btn-inline">
                            <RefreshCw01Icon width={14} height={14} />
                            Generar enlace seguro
                          </span>
                        </button>
                        <button className="btn-danger" type="button" disabled={!canManage || !selectedUser} onClick={() => void deleteSelectedUser()}>
                          <span className="btn-inline">
                            <Trash01Icon width={14} height={14} />
                            Borrar usuario
                          </span>
                        </button>
                      </div>
                    </details>
                  </form>

                  {lastPasswordReset ? (
                    <div className="soft-box form-grid secondary-panel">
                      <p className="muted">Enlace de restablecimiento</p>
                      <strong>{lastPasswordReset.setupLink}</strong>
                      {lastPasswordReset.expiresAt ? <small className="muted">Caduca: {lastPasswordReset.expiresAt}</small> : null}
                      <div className="action-grid">
                        <a className="btn-secondary" href={lastPasswordReset.mailtoLink}>
                          <span className="btn-inline">
                            <Mail01Icon width={14} height={14} />
                            Enviar por mailto
                          </span>
                        </a>
                        {lastPasswordReset.whatsappLink ? (
                          <a className="btn-secondary" href={lastPasswordReset.whatsappLink} target="_blank" rel="noreferrer">
                            <span className="btn-inline">
                              <MessageChatCircleIcon width={14} height={14} />
                              Enviar por WhatsApp
                            </span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            </article>
          </section>
        ) : null}

        {activeSection === "create" && canManage ? (
          <article className="card form-grid module-panel" id="admin-section-create">
            <div>
              <h2 className="subtitle step-title">Alta</h2>
              <p className="module-subtitle">Completa contacto y cantidades iniciales en un solo flujo.</p>
            </div>

            <details className="soft-box activity-disclosure secondary-panel">
              <summary className="activity-summary">
                <span className="btn-inline">
                  <ChevronDownIcon width={14} height={14} />
                  Crear nuevo usuario
                </span>
              </summary>
              <div className="form-grid activity-panel">
                <form className="form-grid" onSubmit={createUser}>
                  <label className="field">
                    <span>Correo electrónico</span>
                    <div className="input-with-icon">
                      <Mail01Icon width={16} height={16} />
                      <input
                        type="email"
                        inputMode="email"
                        value={createUserEmail}
                        onChange={(e) => setCreateUserEmail(e.target.value)}
                        required
                        maxLength={120}
                        placeholder="persona@dominio.com"
                      />
                    </div>
                  </label>

                  <label className="field">
                    <span>WhatsApp</span>
                    <div className="input-with-icon">
                      <MessageChatCircleIcon width={16} height={16} />
                      <input
                        inputMode="tel"
                        value={createUserWhatsapp}
                        onChange={(e) => setCreateUserWhatsapp(e.target.value)}
                        maxLength={30}
                        placeholder="34600111222"
                      />
                    </div>
                  </label>

                  <div className="grid-2">
                    {itemTypes.map((type) => (
                      <label className="field" key={type.id}>
                        <span>{type.name}</span>
                        <div className="input-with-icon">
                          <Ticket01Icon width={16} height={16} />
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={createAssignments[type.id] ?? 0}
                            onChange={(e) =>
                              setCreateAssignments((current) => ({
                                ...current,
                                [type.id]: Number(e.target.value),
                              }))
                            }
                            required
                          />
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="module-actions-inline">
                    <button className="btn-primary" title="Crear usuario" aria-label="Crear usuario">
                      <span className="btn-inline">
                        <Users01Icon width={14} height={14} />
                        Crear usuario
                      </span>
                    </button>
                  </div>
                </form>

                {lastOnboarding ? (
                  <div className="soft-box form-grid secondary-panel">
                    <p className="muted">Enlace de configuracion inicial</p>
                    <strong>{lastOnboarding.setupLink}</strong>
                    {lastOnboarding.expiresAt ? <small className="muted">Caduca: {lastOnboarding.expiresAt}</small> : null}
                    <div className="action-grid">
                      <a className="btn-secondary" href={lastOnboarding.mailtoLink}>
                        <span className="btn-inline">
                          <Mail01Icon width={14} height={14} />
                          Enviar por mailto
                        </span>
                      </a>
                      {lastOnboarding.whatsappLink ? (
                        <a className="btn-secondary" href={lastOnboarding.whatsappLink} target="_blank" rel="noreferrer">
                          <span className="btn-inline">
                            <MessageChatCircleIcon width={14} height={14} />
                            Enviar por WhatsApp
                          </span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </article>
        ) : null}

        {activeSection === "modes" && canExecuteModes ? (
          <article className="card form-grid module-panel" id="admin-section-modes">
            <div>
              <h2 className="subtitle step-title">Modos</h2>
              <p className="module-subtitle">Elige accion rapida: crear, seleccionar para escaneo o modificar.</p>
            </div>

            {canManage ? (
              <details className="soft-box activity-disclosure secondary-panel" open={modeView === "new"} onToggle={(event) => setModeView(event.currentTarget.open ? "new" : modeView === "new" ? null : modeView)}>
                <summary className="activity-summary">
                  <span className="btn-inline">
                    <ChevronDownIcon width={14} height={14} />
                    Crear modo nuevo
                  </span>
                </summary>
                <form className="form-grid activity-panel" onSubmit={createScanMode}>
                <label className="field">
                  <span>Nombre del modo</span>
                  <input
                    value={newScanModeName}
                    onChange={(event) => setNewScanModeName(event.target.value)}
                    minLength={2}
                    maxLength={60}
                    placeholder="Ejemplo: Entrada comedor"
                    required
                  />
                </label>

                <div className="grid-2">
                  <label className="field">
                    <span>Inicio (opcional)</span>
                    <input
                      type="time"
                      value={newScanModeStartTime}
                      onChange={(event) => setNewScanModeStartTime(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Fin (opcional)</span>
                    <input
                      type="time"
                      value={newScanModeEndTime}
                      onChange={(event) => setNewScanModeEndTime(event.target.value)}
                    />
                  </label>
                </div>

                <div className="component-list">
                  {itemTypes.map((type) => (
                    <div key={type.id} className="component-row">
                      <strong>{type.name}</strong>
                      <div className="grid-2">
                        <label className="field">
                          <span>Operacion</span>
                          <select
                            value={scanModeOps[type.id] ?? "add"}
                            onChange={(event) =>
                              setScanModeOps((current) => ({
                                ...current,
                                [type.id]: event.target.value as "add" | "remove",
                              }))
                            }
                          >
                            <option value="add">Anadir</option>
                            <option value="remove">Quitar</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Cantidad</span>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={scanModeQuantities[type.id] ?? 0}
                            onChange={(event) =>
                              setScanModeQuantities((current) => ({
                                ...current,
                                [type.id]: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn-secondary" type="submit" title="Guardar modo" aria-label="Guardar modo">
                  <span className="btn-inline">
                    <Save01Icon width={14} height={14} />
                    Guardar modo
                  </span>
                </button>
                </form>
              </details>
            ) : null}

            <details className="soft-box activity-disclosure secondary-panel" open={modeView === "select"} onToggle={(event) => setModeView(event.currentTarget.open ? "select" : modeView === "select" ? null : modeView)}>
              <summary className="activity-summary">
                <span className="btn-inline">
                  <ChevronDownIcon width={14} height={14} />
                  Seleccionar modo para escaneo
                </span>
              </summary>
              <div className="form-grid activity-panel">
                <div className="soft-box secondary-panel mode-schedule-summary">
                  <p className="muted mode-limit-title">Horarios configurados</p>
                  {modesScheduleSummary.length === 0 ? (
                    <p className="muted">No hay modos creados.</p>
                  ) : (
                    <div className="mode-schedule-grid" role="table" aria-label="Resumen de horarios de modos">
                      <div className="mode-schedule-head" role="row">
                        <span role="columnheader">Modo</span>
                        <span role="columnheader">Horario</span>
                        <span role="columnheader">Estado</span>
                      </div>
                      {modesScheduleSummary.map((modeSummary) => (
                        <div
                          key={`schedule-${modeSummary.id}`}
                          role="row"
                          className={modeSummary.id === activeScanModeId ? "mode-schedule-row mode-schedule-row-active" : "mode-schedule-row"}
                        >
                          <span>{modeSummary.name}</span>
                          <span>{modeSummary.scheduleText}</span>
                          <span className={modeSummary.isActiveNow ? "mode-state mode-state-open" : "mode-state mode-state-closed"}>
                            {modeSummary.isActiveNow ? "Abierto" : "Cerrado"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <label className="field">
                  <span>Modo activo para escanear</span>
                  <select
                    value={activeScanModeId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setActiveScanModeId(value ? Number(value) : null);
                    }}
                  >
                    <option value="">Selecciona un modo</option>
                    {scanModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>{mode.name}</option>
                    ))}
                  </select>
                </label>

                {selectedModeForScan ? (
                  <div className="soft-box secondary-panel mode-limit-box" aria-live="polite">
                    <p className="muted mode-limit-title">Limites diarios del modo activo</p>
                    <p className="muted mode-limit-schedule">
                      {selectedModeForScan.startTime && selectedModeForScan.endTime
                        ? `Horario permitido: ${selectedModeForScan.startTime} - ${selectedModeForScan.endTime}`
                        : "Horario permitido: todo el día"}
                    </p>
                    {selectedModeLimitItems.length === 0 ? (
                      <p className="muted">Este modo no tiene componentes configurados.</p>
                    ) : (
                      <div className="activity-list">
                        {selectedModeLimitItems.map((entry) => (
                          <div
                            key={`${selectedModeForScan.id}-${entry.itemTypeId}`}
                            className={entry.willExceed ? "activity-row mode-limit-row mode-limit-row-warning" : "activity-row mode-limit-row"}
                          >
                            <strong>
                              {entry.itemName} ({entry.operation === "remove" ? "Quitar" : "Anadir"} {entry.quantity})
                            </strong>
                            <span>
                              {entry.operation === "remove"
                                ? entry.dailyScanLimit
                                  ? `Hoy: ${entry.usedToday}/${entry.dailyScanLimit} · Disponible: ${entry.remainingToday}`
                                  : "Sin limite diario"
                                : "No consume limite diario"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="scanner-shell">
                  <video ref={videoRef} className="scanner" muted playsInline />
                  <span className="scanner-overlay" aria-hidden="true" />
                  <span className="scanner-reticle" aria-hidden="true" />
                </div>

                <div className="grid-2">
                  <button className="btn-secondary" type="button" title="Iniciar o detener cámara en modo aplicar" onClick={() => void toggleCamera("mode")}>
                    <span className="btn-inline">
                      <Camera01Icon width={14} height={14} />
                      {cameraEnabled && scanBehavior === "mode" ? "Detener cámara" : "Iniciar cámara"}
                    </span>
                  </button>

                  <button
                    className="btn-secondary"
                    type="button"
                    title="Aplicar modo al token manual"
                    onClick={() => void applyModeByToken(manualToken)}
                  >
                    <span className="btn-inline">
                      <MarkerPin01Icon width={14} height={14} />
                      Aplicar modo por token
                    </span>
                  </button>
                </div>

                <button
                  className="btn-danger"
                  type="button"
                  title="Deshacer ultimo escaneo aplicado"
                  onClick={() => void undoLastScanApply()}
                  disabled={undoingScan || !undoDeadlineMs || undoSecondsLeft <= 0}
                >
                  <span className="btn-inline">
                    <RefreshCw01Icon width={14} height={14} />
                    {undoingScan
                      ? "Revirtiendo..."
                      : undoDeadlineMs && undoSecondsLeft > 0
                        ? `Deshacer ultimo escaneo (${undoSecondsLeft}s)`
                        : "Deshacer ultimo escaneo"}
                  </span>
                </button>

                <label className="field">
                  <span>Token QR manual</span>
                  <div className="input-with-icon">
                    <MarkerPin01Icon width={16} height={16} />
                    <input
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="QRCAPP:..."
                    />
                  </div>
                </label>

              </div>
            </details>

            {canManage ? (
              <details className="soft-box activity-disclosure secondary-panel" open={modeView === "modify"} onToggle={(event) => setModeView(event.currentTarget.open ? "modify" : modeView === "modify" ? null : modeView)}>
                <summary className="activity-summary">
                  <span className="btn-inline">
                    <ChevronDownIcon width={14} height={14} />
                    Modificar modo existente
                  </span>
                </summary>
                <form className="form-grid activity-panel" onSubmit={updateScanMode}>
                <label className="field">
                  <span>Modo a modificar</span>
                  <select
                    value={editModeId ?? ""}
                    onChange={(event) => setEditModeId(event.target.value ? Number(event.target.value) : null)}
                    required
                  >
                    <option value="">Selecciona un modo</option>
                    {scanModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>{mode.name}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Nombre del modo</span>
                  <input
                    value={editModeName}
                    onChange={(event) => setEditModeName(event.target.value)}
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </label>

                <div className="grid-2">
                  <label className="field">
                    <span>Inicio (opcional)</span>
                    <input
                      type="time"
                      value={editModeStartTime}
                      onChange={(event) => setEditModeStartTime(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Fin (opcional)</span>
                    <input
                      type="time"
                      value={editModeEndTime}
                      onChange={(event) => setEditModeEndTime(event.target.value)}
                    />
                  </label>
                </div>

                <div className="component-list">
                  {itemTypes.map((type) => (
                    <div key={type.id} className="component-row">
                      <strong>{type.name}</strong>
                      <div className="grid-2">
                        <label className="field">
                          <span>Operacion</span>
                          <select
                            value={editModeOps[type.id] ?? "add"}
                            onChange={(event) =>
                              setEditModeOps((current) => ({
                                ...current,
                                [type.id]: event.target.value as "add" | "remove",
                              }))
                            }
                          >
                            <option value="add">Anadir</option>
                            <option value="remove">Quitar</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Cantidad</span>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={editModeQuantities[type.id] ?? 0}
                            onChange={(event) =>
                              setEditModeQuantities((current) => ({
                                ...current,
                                [type.id]: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn-secondary" type="submit" title="Guardar cambios del modo" aria-label="Guardar cambios del modo">
                  <span className="btn-inline">
                    <Save01Icon width={14} height={14} />
                    Guardar cambios del modo
                  </span>
                </button>
                </form>
              </details>
            ) : null}
          </article>
        ) : null}

        {activeSection === "scan" && canScan ? (
          <article className="card form-grid module-panel" id="admin-section-scan">
            <h2 className="subtitle step-title">Escanear QR</h2>

            <div className="scanner-shell">
              <video ref={videoRef} className="scanner" muted playsInline />
              <span className="scanner-overlay" aria-hidden="true" />
              <span className="scanner-reticle" aria-hidden="true" />
            </div>

            <div className="grid-2">
              <button className="btn-secondary" type="button" title="Escaneo normal para ver datos del usuario" onClick={() => void toggleCamera("view")}>
                <span className="btn-inline">
                  <Camera01Icon width={14} height={14} />
                  {cameraEnabled && scanBehavior === "view" ? "Detener cámara" : "Iniciar cámara"}
                </span>
              </button>

              <button
                className="btn-secondary"
                type="button"
                title="Buscar y mostrar usuario por token"
                onClick={() => void findUserByToken(manualToken)}
              >
                <span className="btn-inline">
                  <MarkerPin01Icon width={14} height={14} />
                  Buscar por token
                </span>
              </button>
            </div>

            <label className="field">
              <span>Token QR manual</span>
              <div className="input-with-icon">
                <MarkerPin01Icon width={16} height={16} />
                <input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="QRCAPP:..."
                />
              </div>
            </label>
          </article>
        ) : null}

      </div>

      <nav className="bottom-module-bar" aria-label="Modulos de administracion">
        <div
          className={denseBottomBar ? "bottom-module-inner bottom-module-inner-dense" : "bottom-module-inner"}
          role="tablist"
          aria-label="Seleccion de funciones"
          style={bottomBarStyle}
        >
          {moduleTabs.map(({ id, label, Icon, count, tooltip }) => (
            <button
              key={id}
              className={
                activeSection === id
                  ? heldTabId === id
                    ? "module-tab module-tab-active module-tab-label-visible"
                    : "module-tab module-tab-active"
                  : heldTabId === id
                    ? "module-tab module-tab-label-visible"
                    : "module-tab"
              }
              type="button"
              role="tab"
              onClick={() => setActiveSection(id)}
              onPointerDown={() => startHoldLabel(id)}
              onPointerUp={stopHoldLabel}
              onPointerCancel={stopHoldLabel}
              onPointerLeave={stopHoldLabel}
              onBlur={stopHoldLabel}
              aria-controls={`admin-section-${id}`}
              aria-selected={activeSection === id}
              aria-label={count !== undefined ? `${label}: ${count}` : label}
              title={count !== undefined ? `${label} (${count})` : label}
            >
              <Icon width={20} height={20} />
              <span className="module-tab-text">{label}</span>
              {count !== undefined ? <span className="module-tab-badge">{formatTabCount(count)}</span> : null}
              <span className="module-tab-tooltip" aria-hidden="true">{tooltip}</span>
            </button>
          ))}
        </div>
      </nav>
    </section>
  );
}
