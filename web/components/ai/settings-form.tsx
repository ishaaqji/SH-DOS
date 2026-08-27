"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/input";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import {
  AI_TASK_TYPES,
  taskModelsPatch,
  providerSettingsPatch,
  parseQuotaValue,
  type AiConfigUpdate,
  type AiPublicConfig,
  type AiPublicProviderSettings,
} from "@/lib/ai";

interface SettingsFormProps {
  workspaceId: string;
  config: AiPublicConfig;
  canManage: boolean;
}

type SavingKey = "defaults" | "quota" | `provider:${string}` | null;

function taskLabel(task: string): string {
  return task.charAt(0).toUpperCase() + task.slice(1);
}

export function SettingsForm({ workspaceId, config, canManage }: SettingsFormProps) {
  const providerOrder = Object.values(config.providers).sort((a, b) => a.label.localeCompare(b.label));

  const [defaultProvider, setDefaultProvider] = useState(config.defaultProvider);
  const [defaultModel, setDefaultModel] = useState(config.defaultModel ?? "");
  const [taskModels, setTaskModels] = useState<Record<string, string>>(
    Object.fromEntries(AI_TASK_TYPES.map((task) => [task, config.taskModels?.[task] ?? ""])),
  );
  const [quota, setQuota] = useState({
    requests: config.quota.requestsPerDay !== undefined ? String(config.quota.requestsPerDay) : "",
    tokens: config.quota.tokensPerDay !== undefined ? String(config.quota.tokensPerDay) : "",
    cost: config.quota.costPerDay !== undefined ? String(config.quota.costPerDay) : "",
  });
  const [providers, setProviders] = useState<Record<string, { enabled: boolean; baseUrl: string; defaultModel: string }>>(
    Object.fromEntries(
      Object.values(config.providers).map((p) => [
        p.providerId,
        { enabled: p.enabled, baseUrl: p.baseUrl, defaultModel: p.defaultModel ?? "" },
      ]),
    ),
  );
  const [saving, setSaving] = useState<SavingKey>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const postConfig = async (patch: AiConfigUpdate): Promise<AiPublicConfig | null> => {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Save failed");
      return data.config as AiPublicConfig;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  };

  const applyDefaults = (cfg: AiPublicConfig) => {
    setDefaultProvider(cfg.defaultProvider);
    setDefaultModel(cfg.defaultModel ?? "");
    setTaskModels(Object.fromEntries(AI_TASK_TYPES.map((task) => [task, cfg.taskModels?.[task] ?? ""])));
  };

  const applyQuota = (cfg: AiPublicConfig) => {
    setQuota({
      requests: cfg.quota.requestsPerDay !== undefined ? String(cfg.quota.requestsPerDay) : "",
      tokens: cfg.quota.tokensPerDay !== undefined ? String(cfg.quota.tokensPerDay) : "",
      cost: cfg.quota.costPerDay !== undefined ? String(cfg.quota.costPerDay) : "",
    });
  };

  const applyProvider = (cfg: AiPublicConfig, providerId: string) => {
    const p = cfg.providers[providerId];
    if (!p) return;
    setProviders((prev) => ({
      ...prev,
      [providerId]: { enabled: p.enabled, baseUrl: p.baseUrl, defaultModel: p.defaultModel ?? "" },
    }));
  };

  const setProviderField = (
    providerId: string,
    key: "enabled" | "baseUrl" | "defaultModel",
    value: string | boolean,
  ) => {
    setProviders((prev) => ({ ...prev, [providerId]: { ...prev[providerId], [key]: value } }));
  };

  const submitDefaults = async () => {
    setSaving("defaults");
    const patch: AiConfigUpdate = {
      ...(defaultProvider ? { defaultProvider } : {}),
      ...(defaultModel.trim() ? { defaultModel: defaultModel.trim() } : {}),
      ...taskModelsPatch(taskModels),
    };
    const cfg = await postConfig(patch);
    if (cfg) {
      applyDefaults(cfg);
      setNotice("Workspace defaults saved.");
    }
    setSaving(null);
  };

  const submitQuota = async () => {
    setSaving("quota");
    const requests = parseQuotaValue(quota.requests);
    const tokens = parseQuotaValue(quota.tokens);
    const cost = parseQuotaValue(quota.cost);
    const patch: AiConfigUpdate = {
      quota: {
        ...(requests !== undefined ? { requestsPerDay: requests } : {}),
        ...(tokens !== undefined ? { tokensPerDay: tokens } : {}),
        ...(cost !== undefined ? { costPerDay: cost } : {}),
      },
    };
    const cfg = await postConfig(patch);
    if (cfg) {
      applyQuota(cfg);
      setNotice("Daily quota saved.");
    }
    setSaving(null);
  };

  const submitProvider = async (provider: AiPublicProviderSettings) => {
    const key: SavingKey = `provider:${provider.providerId}`;
    setSaving(key);
    const row = providers[provider.providerId];
    const baseUrl = row.baseUrl.trim();
    if (!baseUrl) {
      setError(`Base URL is required for ${provider.label}.`);
      setSaving(null);
      return;
    }
    const patch = providerSettingsPatch(provider, {
      enabled: row.enabled,
      baseUrl,
      ...(row.defaultModel.trim() ? { defaultModel: row.defaultModel.trim() } : {}),
    });
    const cfg = await postConfig(patch);
    if (cfg) {
      applyProvider(cfg, provider.providerId);
      setNotice(`${provider.label} provider saved.`);
    }
    setSaving(null);
  };

  return (
    <div className="settings-form">
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="form-notice" role="status">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader
          title="Workspace defaults"
          description="Default provider, default model and per-task model overrides used when a request does not specify them."
        />
        <CardBody>
          <div className="settings-grid">
            <Field label="Default provider" hint="Provider used when a request does not pick one.">
              <select
                className="select"
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                disabled={!canManage}
              >
                {providerOrder.map((p) => (
                  <option key={p.providerId} value={p.providerId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default model" hint="Model used when no task-specific model is configured.">
              <Input
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                disabled={!canManage}
                placeholder="e.g. gpt-4o-mini"
              />
            </Field>
          </div>

          <div className="settings-grid" style={{ marginTop: "1rem" }}>
            {AI_TASK_TYPES.map((task) => (
              <Field key={task} label={`${taskLabel(task)} model`} hint="Override for this task type; leave blank to use the default.">
                <Input
                  value={taskModels[task]}
                  onChange={(e) => setTaskModels({ ...taskModels, [task]: e.target.value })}
                  disabled={!canManage}
                  placeholder="default"
                />
              </Field>
            ))}
          </div>

          {canManage && (
            <div className="form-actions">
              <Button type="button" loading={saving === "defaults"} disabled={saving !== null} onClick={submitDefaults}>
                Save defaults
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card style={{ marginTop: "1.5rem" }}>
        <CardHeader title="Daily quota" description="Usage limits per day. Leave a field blank to keep its current limit." />
        <CardBody>
          <div className="settings-grid">
            <Field label="Requests per day">
              <Input
                type="number"
                min={0}
                value={quota.requests}
                onChange={(e) => setQuota({ ...quota, requests: e.target.value })}
                disabled={!canManage}
                placeholder="1000"
              />
            </Field>
            <Field label="Tokens per day">
              <Input
                type="number"
                min={0}
                value={quota.tokens}
                onChange={(e) => setQuota({ ...quota, tokens: e.target.value })}
                disabled={!canManage}
                placeholder="1000000"
              />
            </Field>
            <Field label="Cost per day (USD)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={quota.cost}
                onChange={(e) => setQuota({ ...quota, cost: e.target.value })}
                disabled={!canManage}
                placeholder="10"
              />
            </Field>
          </div>

          {canManage && (
            <div className="form-actions">
              <Button type="button" loading={saving === "quota"} disabled={saving !== null} onClick={submitQuota}>
                Save quota
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card style={{ marginTop: "1.5rem" }}>
        <CardHeader
          title="Providers"
          description="Provider connection settings. API keys are stored server-side and are never displayed in this workspace."
        />
        <CardBody>
          {providerOrder.map((p) => {
            const row = providers[p.providerId];
            return (
              <div key={p.providerId} className="settings-provider">
                <div className="settings-provider-head">
                  <Badge variant="primary">{p.label}</Badge>
                  <span className="mono text-xs text-muted">{p.providerId}</span>
                  {!row.enabled && <Badge variant="warning">disabled</Badge>}
                </div>
                <div className="settings-grid">
                  <div>
                    <span className="checkbox-grid-label">Status</span>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => setProviderField(p.providerId, "enabled", e.target.checked)}
                        disabled={!canManage}
                      />
                      Enabled
                    </label>
                  </div>
                  <Field label="Base URL">
                    <Input
                      value={row.baseUrl}
                      onChange={(e) => setProviderField(p.providerId, "baseUrl", e.target.value)}
                      disabled={!canManage}
                    />
                  </Field>
                  <Field label="Default model" hint="Model used when no other model is selected.">
                    <Input
                      value={row.defaultModel}
                      onChange={(e) => setProviderField(p.providerId, "defaultModel", e.target.value)}
                      disabled={!canManage}
                      placeholder="default"
                    />
                  </Field>
                </div>
                {canManage && (
                  <div className="form-actions">
                    <Button
                      type="button"
                      size="sm"
                      loading={saving === `provider:${p.providerId}`}
                      disabled={saving !== null}
                      onClick={() => submitProvider(p)}
                    >
                      Save provider
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {!canManage && (
            <p className="empty-desc">
              You have view-only access. Ask an owner, admin or editor to change AI settings.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
