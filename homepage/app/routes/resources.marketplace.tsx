/**
 * Agent Marketplace 公开页面。
 * 说明：
 * 1. 展示所有已经审核通过的社区 Agent。
 * 2. 提供公开提交流程，提交后先进入 Supabase 审核队列。
 */
import { AlertCircle, ArrowUpRight, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  data,
  Form,
  redirect,
  useActionData,
  useLocation,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/resources.marketplace";
import { marketingTheme } from "@/lib/marketing-theme";
import {
  findAgentMarketplaceSubmissionByNormalizedRepositoryUrl,
  listApprovedAgentMarketplaceSubmissions,
  createAgentMarketplaceSubmission,
} from "@/services/agent-marketplace/repository";
import {
  isAgentMarketplaceCategory,
  normalizePublicUrl,
  normalizeRepositoryUrl,
  normalizeTextInput,
} from "@/services/agent-marketplace/normalization";
import type {
  AgentMarketplaceSubmissionActionData,
  AgentMarketplaceCategory,
  AgentMarketplaceSubmissionFormErrors,
  AgentMarketplaceSubmissionFormValues,
} from "@/types/agent-marketplace";

const MARKETPLACE_PAGE = {
  en: {
    badge: "Supabase-backed",
    title: "Agent Marketplace",
    subtitle:
      "Submit your agent repository, send it into the review queue, and automatically publish approved community agents here.",
    liveTitle: "Approved community agents",
    liveEmptyTitle: "No approved agents yet",
    liveEmptyDescription:
      "The first approved repository will appear here after a quick review.",
    workflowTitle: "Workflow",
    workflow: [
      {
        title: "Submit repository",
        description:
          "Share a public code repository plus a short description of what the agent does.",
      },
      {
        title: "Review in database",
        description:
          "Managers review the submission directly in Supabase and update the review status there.",
      },
      {
        title: "Publish automatically",
        description:
          "Approved submissions show up here without any extra manual publishing step.",
      },
    ],
    formTitle: "Submit your agent",
    formDescription:
      "Every submission is stored in Supabase with a pending review status. Once approved, it becomes visible in this resource page.",
    successTitle: "Submission received",
    successDescription:
      "Your repository has been added to the review queue. We will publish it here after approval.",
    formFields: {
      agentName: "Agent name",
      repositoryUrl: "Repository URL",
      description: "What does this agent do?",
      category: "Category",
      submitterName: "Your name",
      submitterEmail: "Email",
      homepageUrl: "Project homepage (optional)",
      demoUrl: "Demo URL (optional)",
    },
    placeholders: {
      agentName: "Production Incident Agent",
      repositoryUrl: "https://github.com/your-org/incident-agent",
      description:
        "Explain the core workflow, target users, and what makes this agent useful.",
      submitterName: "Jane Doe",
      submitterEmail: "jane@example.com",
      homepageUrl: "https://example.com/incident-agent",
      demoUrl: "https://youtu.be/demo",
    },
    categoryLabels: {
      development: "Development",
      documentation: "Documentation",
      maintenance: "Maintenance",
      testing: "Testing",
    },
    helper: {
      repositoryUrl: "Public GitHub, GitLab, or any public code repository URL.",
      description: "Keep it concrete so reviewers can quickly understand the agent.",
    },
    buttons: {
      submit: "Submit for review",
      submitting: "Submitting...",
      repo: "Repository",
      homepage: "Homepage",
      demo: "Demo",
    },
    reviewBadge: "Approved",
    maintainerLabel: "Maintainer",
    approvedAtLabel: "Approved",
    errors: {
      invalidIntent: "Unsupported form action.",
      agentName: "Please provide an agent name between 2 and 80 characters.",
      repositoryUrl: "Please provide a valid public repository URL.",
      description: "Please provide a description between 24 and 600 characters.",
      category: "Please choose a valid category.",
      submitterName: "Please provide your name between 2 and 80 characters.",
      submitterEmail: "Please provide a valid email address.",
      homepageUrl: "Please provide a valid homepage URL.",
      demoUrl: "Please provide a valid demo URL.",
      duplicate:
        "This repository has already been submitted. We will review the existing entry.",
      unknown: "We could not save your submission. Please try again.",
    },
  },
  zh: {
    badge: "Supabase 驱动",
    title: "Agent 社区资源",
    subtitle:
      "提交你的 Agent 代码仓库，进入审核队列；审核通过后，会自动显示在这个社区资源页里。",
    liveTitle: "已通过审核的社区 Agent",
    liveEmptyTitle: "暂时还没有已通过的 Agent",
    liveEmptyDescription:
      "第一个审核通过的仓库会直接展示在这里。",
    workflowTitle: "流程",
    workflow: [
      {
        title: "提交代码仓库",
        description:
          "填写公开代码仓库地址，并补充一段明确描述，让审核者快速理解 Agent 的用途。",
      },
      {
        title: "在数据库中审核",
        description:
          "管理员直接在 Supabase 后台查看提交记录，并手动修改审核状态。",
      },
      {
        title: "自动公开展示",
        description:
          "一旦审核通过，这条记录会自动出现在当前社区资源页，不需要额外发布操作。",
      },
    ],
    formTitle: "提交你的 Agent",
    formDescription:
      "每一条提交都会先写入 Supabase，并以待审核状态保存。审核通过后才会公开展示。",
    successTitle: "提交成功",
    successDescription:
      "你的仓库已经进入审核队列，审核通过后会显示在这个资源页中。",
    formFields: {
      agentName: "Agent 名称",
      repositoryUrl: "代码仓库地址",
      description: "这个 Agent 是做什么的？",
      category: "分类",
      submitterName: "你的名字",
      submitterEmail: "邮箱",
      homepageUrl: "项目主页（可选）",
      demoUrl: "演示链接（可选）",
    },
    placeholders: {
      agentName: "Production Incident Agent",
      repositoryUrl: "https://github.com/your-org/incident-agent",
      description:
        "请明确说明核心流程、面向谁、解决什么问题，以及为什么值得收录到社区资源里。",
      submitterName: "张三",
      submitterEmail: "zhangsan@example.com",
      homepageUrl: "https://example.com/incident-agent",
      demoUrl: "https://youtu.be/demo",
    },
    categoryLabels: {
      development: "开发",
      documentation: "文档",
      maintenance: "维护",
      testing: "测试",
    },
    helper: {
      repositoryUrl: "支持 GitHub、GitLab 或任意公开代码仓库链接。",
      description: "尽量写具体，能帮助审核者更快判断是否适合社区展示。",
    },
    buttons: {
      submit: "提交审核",
      submitting: "提交中...",
      repo: "仓库",
      homepage: "主页",
      demo: "演示",
    },
    reviewBadge: "已通过审核",
    maintainerLabel: "维护者",
    approvedAtLabel: "通过时间",
    errors: {
      invalidIntent: "不支持的表单动作。",
      agentName: "请填写 2 到 80 个字符之间的 Agent 名称。",
      repositoryUrl: "请填写有效的公开代码仓库地址。",
      description: "请填写 24 到 600 个字符之间的描述。",
      category: "请选择合法的分类。",
      submitterName: "请填写 2 到 80 个字符之间的名字。",
      submitterEmail: "请填写有效的邮箱地址。",
      homepageUrl: "请填写有效的项目主页链接。",
      demoUrl: "请填写有效的演示链接。",
      duplicate: "这个仓库已经提交过了，我们会继续审核已有记录。",
      unknown: "提交保存失败，请稍后重试。",
    },
  },
} as const;

type MarketplaceLang = keyof typeof MARKETPLACE_PAGE;

const FIELD_CLASS_NAME =
  "mt-2 min-h-11 w-full rounded-[16px] border border-[#E7E7EB] bg-[#FAFAFA] px-4 py-3 text-sm text-[#111113] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#111113]";

function createEmptyFormValues(): AgentMarketplaceSubmissionFormValues {
  return {
    agentName: "",
    repositoryUrl: "",
    description: "",
    category: "development",
    submitterName: "",
    submitterEmail: "",
    homepageUrl: "",
    demoUrl: "",
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getLangFromPathname(pathname: string): MarketplaceLang {
  return pathname.startsWith("/zh/") || pathname === "/zh" ? "zh" : "en";
}

function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const isZh = loaderData?.lang === "zh";
  const title = isZh ? "Downcity — Agent 社区资源" : "Downcity — Agent Marketplace";
  const description = isZh
    ? "提交 Agent 代码仓库，进入 Supabase 审核流程，并在通过后显示到社区资源页。"
    : "Submit agent repositories into a Supabase review queue and publish approved community agents automatically.";

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lang = getLangFromPathname(url.pathname);
  const approvedAgents = await listApprovedAgentMarketplaceSubmissions();

  return {
    lang,
    approvedAgents,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  const lang = getLangFromPathname(url.pathname);
  const content = MARKETPLACE_PAGE[lang];
  const formData = await request.formData();
  const intent = normalizeTextInput(formData.get("intent"));

  const values: AgentMarketplaceSubmissionFormValues = {
    agentName: normalizeTextInput(formData.get("agentName")),
    repositoryUrl: normalizeTextInput(formData.get("repositoryUrl")),
    description: normalizeTextInput(formData.get("description")),
    category: normalizeTextInput(formData.get("category")),
    submitterName: normalizeTextInput(formData.get("submitterName")),
    submitterEmail: normalizeTextInput(formData.get("submitterEmail")),
    homepageUrl: normalizeTextInput(formData.get("homepageUrl")),
    demoUrl: normalizeTextInput(formData.get("demoUrl")),
  };

  if (intent !== "submit") {
    return data<AgentMarketplaceSubmissionActionData>(
      {
        ok: false,
        errors: { form: content.errors.invalidIntent },
        values,
      },
      { status: 400 },
    );
  }

  const errors: AgentMarketplaceSubmissionFormErrors = {};

  if (values.agentName.length < 2 || values.agentName.length > 80) {
    errors.agentName = content.errors.agentName;
  }

  let normalizedRepositoryUrl = "";
  try {
    normalizedRepositoryUrl = normalizeRepositoryUrl(values.repositoryUrl);
  } catch {
    errors.repositoryUrl = content.errors.repositoryUrl;
  }

  if (values.description.length < 24 || values.description.length > 600) {
    errors.description = content.errors.description;
  }

  if (!isAgentMarketplaceCategory(values.category)) {
    errors.category = content.errors.category;
  }

  if (values.submitterName.length < 2 || values.submitterName.length > 80) {
    errors.submitterName = content.errors.submitterName;
  }

  if (!isValidEmail(values.submitterEmail)) {
    errors.submitterEmail = content.errors.submitterEmail;
  }

  let normalizedHomepageUrl = "";
  if (values.homepageUrl) {
    try {
      normalizedHomepageUrl = normalizePublicUrl(values.homepageUrl);
    } catch {
      errors.homepageUrl = content.errors.homepageUrl;
    }
  }

  let normalizedDemoUrl = "";
  if (values.demoUrl) {
    try {
      normalizedDemoUrl = normalizePublicUrl(values.demoUrl);
    } catch {
      errors.demoUrl = content.errors.demoUrl;
    }
  }

  if (Object.keys(errors).length > 0) {
    return data<AgentMarketplaceSubmissionActionData>(
      { ok: false, errors, values },
      { status: 400 },
    );
  }

  const category = values.category as AgentMarketplaceCategory;
  const existing =
    await findAgentMarketplaceSubmissionByNormalizedRepositoryUrl(
      normalizedRepositoryUrl,
    );
  if (existing) {
    return data<AgentMarketplaceSubmissionActionData>(
      {
        ok: false,
        errors: { form: content.errors.duplicate },
        values,
      },
      { status: 409 },
    );
  }

  try {
    await createAgentMarketplaceSubmission({
      agentName: values.agentName,
      repositoryUrl: normalizedRepositoryUrl,
      normalizedRepositoryUrl,
      description: values.description,
      category,
      submitterName: values.submitterName,
      submitterEmail: values.submitterEmail,
      homepageUrl: normalizedHomepageUrl || null,
      demoUrl: normalizedDemoUrl || null,
    });
  } catch {
    return data<AgentMarketplaceSubmissionActionData>(
      {
        ok: false,
        errors: { form: content.errors.unknown },
        values,
      },
      { status: 500 },
    );
  }

  url.searchParams.set("submitted", "1");
  return redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export default function Marketplace({
  loaderData,
}: Route.ComponentProps) {
  const actionData =
    useActionData<typeof action>() as AgentMarketplaceSubmissionActionData | undefined;
  const navigation = useNavigation();
  const location = useLocation();
  const content = MARKETPLACE_PAGE[loaderData.lang];
  const formValues = actionData?.values ?? createEmptyFormValues();
  const formErrors = actionData?.errors;
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "submit";
  const submitted = new URLSearchParams(location.search).get("submitted") === "1";

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>{content.badge}</span>
        <h1 className={marketingTheme.pageTitle}>{content.title}</h1>
        <p className={marketingTheme.lead}>{content.subtitle}</p>
      </header>

      {submitted ? (
        <section className="mt-8 rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-5 text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">{content.successTitle}</h2>
              <p className="mt-1 text-sm leading-7 text-emerald-900/80">
                {content.successDescription}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {content.workflow.map((item, index) => (
          <article key={item.title} className={`${marketingTheme.panel} p-5`}>
            <p className={marketingTheme.eyebrow}>
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {item.description}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className={`${marketingTheme.panel} p-6`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className={marketingTheme.sectionTitle}>{content.liveTitle}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {content.workflow[2].description}
              </p>
            </div>
            <span className={marketingTheme.badge}>
              {loaderData.approvedAgents.length}
            </span>
          </div>

          {loaderData.approvedAgents.length === 0 ? (
            <div className={`${marketingTheme.panelSoft} mt-6 p-5`}>
              <h3 className="text-base font-semibold">{content.liveEmptyTitle}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {content.liveEmptyDescription}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {loaderData.approvedAgents.map((agent) => (
                <article key={agent.id} className={`${marketingTheme.panelSoft} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {agent.agentName}
                        </h3>
                        <span className={marketingTheme.badge}>
                          {content.reviewBadge}
                        </span>
                        <span className={marketingTheme.tagSoft}>
                          {
                            content.categoryLabels[
                              agent.category as keyof typeof content.categoryLabels
                            ]
                          }
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                    <ShieldCheck className="size-5 shrink-0 text-foreground/72" />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={agent.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={marketingTheme.primaryButton}
                    >
                      {content.buttons.repo}
                      <ArrowUpRight className="size-4" />
                    </a>
                    {agent.homepageUrl ? (
                      <a
                        href={agent.homepageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={marketingTheme.secondaryButton}
                      >
                        {content.buttons.homepage}
                      </a>
                    ) : null}
                    {agent.demoUrl ? (
                      <a
                        href={agent.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={marketingTheme.secondaryButton}
                      >
                        {content.buttons.demo}
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <span>
                      {content.maintainerLabel}: {agent.submitterName}
                    </span>
                    {formatDisplayDate(agent.approvedAt) ? (
                      <span>
                        {content.approvedAtLabel}: {formatDisplayDate(agent.approvedAt)}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <section className={`${marketingTheme.panel} p-6`}>
            <h2 className="text-xl font-semibold text-foreground">
              {content.formTitle}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {content.formDescription}
            </p>

            {formErrors?.form ? (
              <div className="mt-5 rounded-[18px] border border-red-200 bg-red-50/80 p-4 text-red-950">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p className="text-sm leading-6">{formErrors.form}</p>
                </div>
              </div>
            ) : null}

            <Form method="post" className="mt-6 space-y-4">
              <input type="hidden" name="intent" value="submit" />

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.agentName}
                </span>
                <input
                  name="agentName"
                  defaultValue={formValues.agentName}
                  className={FIELD_CLASS_NAME}
                  placeholder={content.placeholders.agentName}
                />
                {formErrors?.agentName ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.agentName}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.repositoryUrl}
                </span>
                <input
                  name="repositoryUrl"
                  defaultValue={formValues.repositoryUrl}
                  className={FIELD_CLASS_NAME}
                  placeholder={content.placeholders.repositoryUrl}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {content.helper.repositoryUrl}
                </p>
                {formErrors?.repositoryUrl ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.repositoryUrl}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.description}
                </span>
                <textarea
                  name="description"
                  defaultValue={formValues.description}
                  className={`${FIELD_CLASS_NAME} min-h-36 resize-y`}
                  placeholder={content.placeholders.description}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {content.helper.description}
                </p>
                {formErrors?.description ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.description}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.category}
                </span>
                <select
                  name="category"
                  defaultValue={formValues.category}
                  className={FIELD_CLASS_NAME}
                >
                  {Object.entries(content.categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {formErrors?.category ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.category}</p>
                ) : null}
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-foreground">
                    {content.formFields.submitterName}
                  </span>
                  <input
                    name="submitterName"
                    defaultValue={formValues.submitterName}
                    className={FIELD_CLASS_NAME}
                    placeholder={content.placeholders.submitterName}
                  />
                  {formErrors?.submitterName ? (
                    <p className="mt-2 text-xs text-red-600">{formErrors.submitterName}</p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-foreground">
                    {content.formFields.submitterEmail}
                  </span>
                  <input
                    name="submitterEmail"
                    type="email"
                    defaultValue={formValues.submitterEmail}
                    className={FIELD_CLASS_NAME}
                    placeholder={content.placeholders.submitterEmail}
                  />
                  {formErrors?.submitterEmail ? (
                    <p className="mt-2 text-xs text-red-600">{formErrors.submitterEmail}</p>
                  ) : null}
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.homepageUrl}
                </span>
                <input
                  name="homepageUrl"
                  defaultValue={formValues.homepageUrl}
                  className={FIELD_CLASS_NAME}
                  placeholder={content.placeholders.homepageUrl}
                />
                {formErrors?.homepageUrl ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.homepageUrl}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {content.formFields.demoUrl}
                </span>
                <input
                  name="demoUrl"
                  defaultValue={formValues.demoUrl}
                  className={FIELD_CLASS_NAME}
                  placeholder={content.placeholders.demoUrl}
                />
                {formErrors?.demoUrl ? (
                  <p className="mt-2 text-xs text-red-600">{formErrors.demoUrl}</p>
                ) : null}
              </label>

              <button type="submit" className={marketingTheme.primaryButton} disabled={isSubmitting}>
                {isSubmitting ? content.buttons.submitting : content.buttons.submit}
              </button>
            </Form>
          </section>
        </div>
      </section>
    </div>
  );
}
