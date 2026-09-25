const TRANSLATIONS = {
  onboarding: {
    home: {
      welcome: "Welcome",
      getStarted: "Get Started",
    },
    llm: {
      title: "LLM Preference",
      description:
        "AnythingLLM can work with many LLM providers. This will be the service which handles chatting.",
    },
    userSetup: {
      title: "User Setup",
      description: "Configure your user settings.",
      howManyUsers: "How many users will be using this instance?",
      justMe: "Just me",
      myTeam: "My team",
      instancePassword: "Instance Password",
      setPassword: "Would you like to set up a password?",
      passwordReq: "Passwords must be at least 8 characters.",
      passwordWarn:
        "It's important to save this password because there is no recovery method.",
      adminUsername: "Admin account username",
      adminPassword: "Admin account password",
      adminPasswordReq: "Passwords must be at least 8 characters.",
      teamHint:
        "By default, you will be the only admin. Once onboarding is completed you can create and invite others to be users or admins. Do not lose your password as only admins can reset passwords.",
    },
    data: {
      title: "Data Handling & Privacy",
      description:
        "We are committed to transparency and control when it comes to your personal data.",
      settingsHint:
        "These settings can be reconfigured at any time in the settings.",
    },
    survey: {
      title: "Welcome to AnythingLLM",
      description: "Help us make AnythingLLM built for your needs. Optional.",
      email: "What's your email?",
      useCase: "What will you use AnythingLLM for?",
      useCaseWork: "For work",
      useCasePersonal: "For personal use",
      useCaseOther: "Other",
      comment: "How did you hear about AnythingLLM?",
      commentPlaceholder:
        "Reddit, Twitter, GitHub, YouTube, etc. - Let us know how you found us!",
      skip: "Skip Survey",
      thankYou: "Thank you for your feedback!",
    },
  },
  common: {
    "workspaces-name": "Workspace Name",
    selection: "Model Selection",
    saving: "Saving...",
    save: "Save changes",
    previous: "Previous Page",
    next: "Next Page",
    optional: "Optional",
    yes: "Yes",
    no: "No",
    on: "On",
    none: "None",
    stopped: "Stopped",
    search: "Search",
    username_requirements:
      "Username must be 2-64 characters, start with a lowercase letter, and only contain lowercase letters, numbers, underscores, hyphens, and periods.",
    loading: "Loading",
    refresh: "Refresh",
  },
  home: {
    welcome: "Welcome",
    chooseWorkspace: "Choose a workspace to start chatting!",
    notAssigned:
      "You currently aren't assigned to any workspaces.\nPlease contact your administrator to request access to a workspace.",
    goToWorkspace: 'Go to "{{workspace}}"',
  },
  settings: {
    title: "Instance Settings",
    invites: "Invites",
    users: "Users",
    workspaces: "Workspaces",
    "workspace-chats": "Workspace Chats",
    customization: "Customization",
    interface: "UI Preferences",
    branding: "Branding & Whitelabeling",
    chat: "Chat",
    "api-keys": "Developer API",
    llm: "LLM",
    transcription: "Transcription",
    embedder: "Embedder",
    "text-splitting": "Text Splitter & Chunking",
    "image-generation": "Image Generation",
    "voice-speech": "Voice & Speech",
    "vector-database": "Vector Database",
    embeds: "Chat Embed",
    security: "Security",
    "event-logs": "Event Logs",
    "scheduled-jobs": "Scheduled Jobs",
    privacy: "Privacy & Data",
    "ai-providers": "AI Providers",
    "agent-skills": "Agent Skills",
    "model-router": "Model Router",
    "community-hub": {
      title: "Community Hub",
      trending: "Explore Trending",
      "your-account": "Your Account",
      "import-item": "Import Item",
    },
    admin: "Admin",
    tools: "Tools",
    "system-prompt-variables": "System Prompt Variables",
    "experimental-features": "Experimental Features",
    contact: "Contact Support",
    "browser-extension": "Browser Extension",
    "mobile-app": "AnythingLLM Mobile",
    "agents-and-mcp": "Agents & MCP",
    "default-system-prompt": "Default System Prompt",
    channels: "Channels",
    "available-channels": {
      telegram: "Telegram",
    },
  },
  sidebar: {
    projects: "Projects",
    "new-workspace": "New workspace",
    "agents-mcp": "Agents & MCP",
    settings: "Settings",
    "back-to-workspaces": "Back to workspaces",
    "open-project-chat": "Open project chat",
    "new-task": "New task",
    pinned: "Pinned",
    pin: "Pin to sidebar",
    unpin: "Unpin from sidebar",
    new_thread: "New thread",
    starting_thread: "Starting thread...",
    deleted_thread: "Deleted thread",
    restore_thread: "Restore thread",
    mark_for_deletion: "Mark for deletion",
    thread_options: "Thread options",
    rename_thread: "Rename",
    delete_thread: "Delete thread",
    delete_selected: "Delete selected",
    nav_back: "Go back",
    nav_forward: "Go forward",
  },
  command_palette: {
    placeholder: "Type a command or search...",
    no_results: "No results",
    action_new_workspace: "New workspace",
    group_actions: "Actions",
    group_theme: "Theme",
    group_navigate: "Navigate",
    group_workspaces: "Workspaces",
    group_threads: "Threads",
    nav_home: "Home",
    active: "active",
  },
  "project-switcher": {
    "search-placeholder": "Search projects",
    "open-folder": "Open folder",
    "no-project": "Chat outside a project",
    "no-workspaces": "No projects yet",
  },
  login: {
    "multi-user": {
      welcome: "Welcome",
      "placeholder-username": "Username",
      "placeholder-password": "Password",
      login: "Login",
      validating: "Validating...",
      "forgot-pass": "Forgot password",
      reset: "Reset",
    },
    "sign-in":
      "Enter your username and password to access your {{appName}} instance.",
    "password-reset": {
      title: "Password Reset",
      description:
        "Provide the necessary information below to reset your password.",
      "recovery-codes": "Recovery Codes",
      "back-to-login": "Back to Login",
    },
  },
  "main-page": {
    greeting: "How can I help you today?",
    quickActions: {
      createAgent: "Create an Agent",
      editWorkspace: "Edit Workspace",
      uploadDocument: "Upload a Document",
    },
  },
  "new-workspace": {
    title: "New Project",
    placeholder: "My Project",
    "folder-label": "Project Folder",
    "folder-placeholder": "my-app",
    "folder-hint":
      "A folder name or path inside the terminal root. It will be created if missing, and the project name is taken from it.",
    "folder-required": "Give the project a folder first.",
    browse: "Browse folders",
    "system-dialog": "System dialog",
    "browse-title": "Choose a project folder",
    "browse-root": "Root",
    "browse-error": "Could not list folders.",
    "browse-empty": "No folders here yet - create one below.",
    "browse-open": "Open folder",
    "browse-select": "Select",
    "browse-new": "New folder",
    "browse-use": "Use",
    "browse-use-current": "Use {{folder}}",
    "browse-pick-hint": "Pick a folder below first",
  },
  "workspaces—settings": {
    general: "General Settings",
    chat: "Chat Settings",
    vector: "Vector Database",
    members: "Members",
    agent: "Agent Configuration",
  },
  general: {
    vector: {
      title: "Vector Count",
      description: "Total number of vectors in your vector database.",
    },
    names: {
      description: "This will only change the display name of your workspace.",
    },
    "project-folder": {
      title: "Project Folder",
      description:
        "The folder on the agent machine this project works in. Bound at creation from the folder name; the agent runs its terminal commands here so each project's chats stay separated by folder. Leave empty to use the global terminal root.",
      placeholder: "Empty = global terminal root",
    },
    message: {
      title: "Suggested Chat Messages",
      description:
        "Customize the messages that will be suggested to your workspace users.",
      add: "Add new message",
      save: "Save Messages",
      heading: "Explain to me",
      body: "the benefits of AnythingLLM",
    },
    delete: {
      title: "Delete Workspace",
      description:
        "Delete this workspace and all of its data. This will delete the workspace for all users.",
      delete: "Delete Workspace",
      deleting: "Deleting Workspace...",
      "confirm-start": "You are about to delete your entire",
      "confirm-end":
        "workspace. This will remove all vector embeddings in your vector database.\n\nThe original source files will remain untouched. This action is irreversible.",
    },
  },
  chat: {
    llm: {
      title: "Workspace LLM Provider",
      description:
        "The specific LLM provider & model that will be used for this workspace. By default, it uses the system LLM provider and settings.",
      search: "Search all LLM providers",
    },
    model: {
      title: "Workspace Chat model",
      description:
        "The specific chat model that will be used for this workspace. If empty, will use the system LLM preference.",
    },
    mode: {
      title: "Chat mode",
      automatic: {
        title: "Agent",
        description:
          "will automatically use tools if the model and provider support native tool calling.<br />If native tooling is not supported, you will need to use the @agent command to use tools.",
      },
      chat: {
        title: "Chat",
        description:
          "will provide answers with the LLM's general knowledge <b>and</b> document context that is found.<br />You will need to use the @agent command to use tools.",
      },
      query: {
        title: "Query",
        description:
          "will provide answers <b>only</b> if document context is found.<br />You will need to use the @agent command to use tools.",
      },
    },
    history: {
      title: "Chat History",
      "desc-start":
        "The number of previous chats that will be included in the response's short-term memory.",
      recommend: "Recommend 20. ",
    },
    compaction: {
      title: "Context compaction",
      description:
        "Summarize older conversation history into a compact summary once it nears the model's context window, keeping the most recent exchanges in full. Use /compact in chat to compress manually at any time.",
      auto_on: "Auto",
      auto_off: "Manual only",
      threshold_label: "Trigger threshold (% of context window)",
      threshold_hint:
        "Auto-compaction runs when the conversation reaches this percentage of the model's context window. 30–95, default 75.",
    },
    prompt: {
      title: "System Prompt",
      description:
        "The prompt that will be used on this workspace. Define the context and instructions for the AI to generate a response. You should provide a carefully crafted prompt so the AI can generate a relevant and accurate response.",
      history: {
        title: "System Prompt History",
        clearAll: "Clear All",
        noHistory: "No system prompt history available",
        restore: "Restore",
        delete: "Delete",
        publish: "Publish to Community Hub",
        deleteConfirm: "Are you sure you want to delete this history item?",
        clearAllConfirm:
          "Are you sure you want to clear all history? This action cannot be undone.",
        expand: "Expand",
      },
    },
    refusal: {
      title: "Query mode refusal response",
      "desc-start": "When in",
      query: "query",
      "desc-end":
        "mode, you may want to return a custom refusal response when no context is found.",
      "tooltip-title": "Why am I seeing this?",
      "tooltip-description":
        "You are in query mode, which only uses information from your documents. Switch to chat mode for more flexible conversations, or click here to visit our documentation to learn more about chat modes.",
    },
    temperature: {
      title: "LLM Temperature",
      "desc-end":
        "The higher the number the more creative. For some models this can lead to incoherent responses when set too high.",
    },
  },
  "vector-workspace": {
    identifier: "Vector database identifier",
    snippets: {
      title: "Max Context Snippets",
      description:
        "This setting controls the maximum amount of context snippets that will be sent to the LLM for per chat or query.",
      recommend: "Recommended: 4",
    },
    doc: {
      title: "Document similarity threshold",
      description:
        "The minimum similarity score required for a source to be considered related to the chat. The higher the number, the more similar the source must be to the chat.",
      zero: "No restriction",
      low: "Low (similarity score ≥ .25)",
      medium: "Medium (similarity score ≥ .50)",
      high: "High (similarity score ≥ .75)",
    },
    reset: {
      reset: "Reset Vector Database",
      resetting: "Clearing vectors...",
      confirm:
        "You are about to reset this workspace's vector database. This will remove all vector embeddings currently embedded.\n\nThe original source files will remain untouched. This action is irreversible.",
      error: "Workspace vector database could not be reset!",
      success: "Workspace vector database was reset!",
    },
  },
  agent: {
    "performance-warning":
      "Performance of LLMs that do not explicitly support tool-calling is highly dependent on the model's capabilities and accuracy. Some abilities may be limited or non-functional.",
    provider: {
      title: "Workspace Agent LLM Provider",
      description:
        "The specific LLM provider & model that will be used for this workspace's @agent agent.",
    },
    mode: {
      chat: {
        title: "Workspace Agent Chat model",
        description:
          "The specific chat model that will be used for this workspace's @agent agent.",
      },
      title: "Workspace Agent model",
      description:
        "The specific LLM model that will be used for this workspace's @agent agent.",
      wait: "-- waiting for models --",
    },
    skill: {
      rag: {
        title: "RAG & long-term memory",
        description:
          'Allow the agent to leverage your local documents to answer a query or ask the agent to "remember" pieces of content for long-term memory retrieval.',
      },
      view: {
        title: "View & summarize documents",
        description:
          "Allow the agent to list and summarize the content of workspace files currently embedded.",
      },
      scrape: {
        title: "Scrape websites",
        description:
          "Allow the agent to visit and scrape the content of websites.",
      },
      generate: {
        title: "Generate charts",
        description:
          "Enable the default agent to generate various types of charts from data provided or given in chat.",
      },
      generateImage: {
        title: "Generate images",
        description:
          "Allow the agent to generate images from chat, or edit images attached to the conversation, using your configured image generation provider.",
      },
      web: {
        title: "Web Search",
        description:
          "Enable your agent to search the web to answer your questions by connecting to a web-search (SERP) provider.",
      },
      sql: {
        title: "SQL Connector",
        description:
          "Enable your agent to be able to leverage SQL to answer you questions by connecting to various SQL database providers.",
      },
      scheduledJob: {
        title: "Create scheduled jobs",
        description:
          'Allow the agent to create recurring Scheduled Jobs from chat (e.g. "every weekday at 9am summarize my inbox and email me"). Available in single-user mode only.',
      },
      filesystem: {
        title: "File System Access",
        description:
          "Enable your agent to read, write, search, and manage files within a designated directory. Supports file editing, directory navigation, and content search.",
        learnMore: "Learn more about this how to use this skill",
        configuration: "Configuration",
        readActions: "Read Actions",
        writeActions: "Write Actions",
        warning:
          "Filesystem access can be dangerous as it can modify or delete files. Please consult the <a>documentation</a> before enabling.",
        skills: {
          "read-text-file": {
            title: "Read File",
            description:
              "Read contents of files (text, code, PDF, images, etc.)",
          },
          "read-multiple-files": {
            title: "Read Multiple Files",
            description: "Read multiple files at once",
          },
          "list-directory": {
            title: "List Directory",
            description: "List files and directories in a folder",
          },
          "search-files": {
            title: "Search Files",
            description: "Search for files by name or content",
          },
          "get-file-info": {
            title: "Get File Info",
            description: "Get detailed metadata about files",
          },
          "write-text-file": {
            title: "Write Text File",
            description:
              "Create new text files or overwrite existing text files",
          },
          "edit-file": {
            title: "Edit File",
            description: "Make line-based edits to text files",
          },
          "create-directory": {
            title: "Create Directory",
            description: "Create new directories",
          },
          "copy-file": {
            title: "Copy File",
            description: "Copy files and directories",
          },
          "move-file": {
            title: "Move/Rename File",
            description: "Move or rename files and directories",
          },
        },
      },
      terminal: {
        title: "Terminal",
        description:
          "Let the agent run shell commands (install dependencies, scaffold projects, start dev servers, self-test with curl). Requires the AGENT_ENABLE_TERMINAL=1 opt-in on the server; commands run in the configured AGENT_TERMINAL_ROOT directory and go through tool approval.",
      },
      createFiles: {
        title: "Document Creation",
        description:
          "Enable your agent to create binary document formats like PowerPoint presentations, Excel spreadsheets, Word documents, and PDFs. Files can be downloaded directly from the chat window.",
        configuration: "Available Document Types",
        skills: {
          "create-text-file": {
            title: "Text Files",
            description:
              "Create text files with any content and extension (.txt, .md, .json, .csv, etc.)",
          },
          "create-pptx": {
            title: "PowerPoint Presentations",
            description:
              "Create new PowerPoint presentations with slides, titles, and bullet points",
          },
          "create-pdf": {
            title: "PDF Documents",
            description:
              "Create PDF documents from markdown or plain text with basic styling",
          },
          "create-xlsx": {
            title: "Excel Spreadsheets",
            description:
              "Create Excel documents for tabular data with sheets and styling",
          },
          "create-docx": {
            title: "Word Documents",
            description:
              "Create Word documents with basic styling and formatting",
          },
        },
      },
      gmail: {
        title: "GMail",
        description:
          "Enable your agent to interact with Gmail - search emails, read threads, compose drafts, send emails, and manage your inbox. <a>Read the documentation</a>.",
        multiUserWarning:
          "Gmail integration is not available in multi-user mode for security reasons. Please disable multi-user mode to use this feature.",
        configuration: "Gmail Configuration",
        deploymentId: "Deployment ID",
        deploymentIdHelp:
          "The deployment ID from your Google Apps Script web app",
        apiKey: "API Key",
        apiKeyHelp:
          "The API key you configured in your Google Apps Script deployment",
        configurationRequired:
          "Please configure the Deployment ID and API Key to enable Gmail skills.",
        configured: "Configured",
        searchSkills: "Search skills...",
        noSkillsFound: "No skills match your search.",
        categories: {
          search: {
            title: "Search & Read Emails",
            description: "Search and read emails from your Gmail inbox",
          },
          drafts: {
            title: "Draft Emails",
            description: "Create, edit, and manage email drafts",
          },
          send: {
            title: "Send & Reply to Emails",
            description: "Send emails and reply to threads immediately",
          },
          threads: {
            title: "Manage Email Threads",
            description:
              "Manage email threads - mark read/unread, archive, trash",
          },
          account: {
            title: "Integration Statistics",
            description: "View mailbox statistics and account information",
          },
        },
        skills: {
          getInbox: {
            title: "Get Inbox",
            description: "Streamlined way to get the inbox emails from Gmail",
          },
          search: {
            title: "Search Emails",
            description: "Search emails using Gmail query syntax",
          },
          readThread: {
            title: "Read Thread",
            description: "Read a full email thread by ID",
          },
          createDraft: {
            title: "Create Draft",
            description: "Create a new draft email",
          },
          createDraftReply: {
            title: "Create Draft Reply",
            description: "Create a draft reply to an existing thread",
          },
          updateDraft: {
            title: "Update Draft",
            description: "Update an existing draft email",
          },
          getDraft: {
            title: "Get Draft",
            description: "Retrieve a specific draft by ID",
          },
          listDrafts: {
            title: "List Drafts",
            description: "List all draft emails",
          },
          deleteDraft: {
            title: "Delete Draft",
            description: "Delete a draft email",
          },
          sendDraft: {
            title: "Send Draft",
            description: "Send an existing draft email",
          },
          sendEmail: {
            title: "Send Email",
            description: "Send an email immediately",
          },
          replyToThread: {
            title: "Reply to Thread",
            description: "Reply to an email thread immediately",
          },
          markRead: {
            title: "Mark Read",
            description: "Mark a thread as read",
          },
          markUnread: {
            title: "Mark Unread",
            description: "Mark a thread as unread",
          },
          moveToTrash: {
            title: "Move to Trash",
            description: "Move a thread to trash",
          },
          moveToArchive: {
            title: "Archive",
            description: "Archive a thread",
          },
          moveToInbox: {
            title: "Move to Inbox",
            description: "Move a thread to inbox",
          },
          getMailboxStats: {
            title: "Mailbox Stats",
            description: "Get unread counts and mailbox statistics",
          },
        },
      },
      googleCalendar: {
        title: "Google Calendar",
        description:
          "Enable your agent to interact with Google Calendar - view calendars, get events, create and update events, and manage RSVPs. <a>Read the documentation</a>.",
        multiUserWarning:
          "Google Calendar integration is not available in multi-user mode for security reasons. Please disable multi-user mode to use this feature.",
        configuration: "Google Calendar Configuration",
        deploymentId: "Deployment ID",
        deploymentIdHelp:
          "The deployment ID from your Google Apps Script web app",
        apiKey: "API Key",
        apiKeyHelp:
          "The API key you configured in your Google Apps Script deployment",
        configurationRequired:
          "Please configure the Deployment ID and API Key to enable Google Calendar skills.",
        configured: "Configured",
        searchSkills: "Search skills...",
        noSkillsFound: "No skills match your search.",
        categories: {
          calendars: {
            title: "Calendars",
            description: "View and manage your Google Calendars",
          },
          readEvents: {
            title: "Read Events",
            description: "View and search calendar events",
          },
          writeEvents: {
            title: "Create & Update Events",
            description: "Create new events and modify existing ones",
          },
          rsvp: {
            title: "RSVP Management",
            description: "Manage your response status for events",
          },
        },
        skills: {
          listCalendars: {
            title: "List Calendars",
            description: "List all calendars you own or are subscribed to",
          },
          getCalendar: {
            title: "Get Calendar Details",
            description: "Get detailed information about a specific calendar",
          },
          getEvent: {
            title: "Get Event",
            description: "Get detailed information about a specific event",
          },
          getEventsForDay: {
            title: "Get Events for Day",
            description: "Get all events scheduled for a specific day",
          },
          getEvents: {
            title: "Get Events (Date Range)",
            description: "Get events within a custom date range",
          },
          getUpcomingEvents: {
            title: "Get Upcoming Events",
            description:
              "Get events for today, this week, or this month using simple keywords",
          },
          quickAdd: {
            title: "Quick Add Event",
            description:
              "Create an event from natural language (e.g., 'Meeting tomorrow at 3pm')",
          },
          createEvent: {
            title: "Create Event",
            description:
              "Create a new event with full control over all properties",
          },
          updateEvent: {
            title: "Update Event",
            description: "Update an existing calendar event",
          },
          setMyStatus: {
            title: "Set RSVP Status",
            description: "Accept, decline, or tentatively accept an event",
          },
        },
      },
      outlook: {
        title: "Outlook",
        description:
          "Enable your agent to interact with Microsoft Outlook - search emails, read threads, compose drafts, send emails, and manage your inbox via Microsoft Graph API. <a>Read the documentation</a>.",
        multiUserWarning:
          "Outlook integration is not available in multi-user mode for security reasons. Please disable multi-user mode to use this feature.",
        configuration: "Outlook Configuration",
        authType: "Account Type",
        authTypeHelp:
          "Choose which types of Microsoft accounts can authenticate. 'All accounts' supports both personal and work/school accounts. 'Personal only' restricts to personal Microsoft accounts. 'Organization only' restricts to work/school accounts from a specific Azure AD tenant.",
        authTypeCommon: "All accounts (personal & work/school)",
        authTypeConsumers: "Personal Microsoft accounts only",
        authTypeOrganization: "Organization accounts only (requires Tenant ID)",
        clientId: "Application (Client) ID",
        clientIdHelp:
          "The Application (Client) ID from your Azure AD app registration",
        tenantId: "Directory (Tenant) ID",
        tenantIdHelp:
          "The Directory (Tenant) ID from your Azure AD app registration. Required only for organization-only authentication.",
        clientSecret: "Client Secret",
        clientSecretHelp:
          "The client secret value from your Azure AD app registration",
        configurationRequired:
          "Please configure the Client ID and Client Secret to enable Outlook skills.",
        authRequired:
          "Save your credentials first, then authenticate with Microsoft to complete the setup.",
        authenticateWithMicrosoft: "Authenticate with Microsoft",
        authenticated: "Successfully authenticated with Microsoft Outlook.",
        revokeAccess: "Revoke Access",
        configured: "Configured",
        searchSkills: "Search skills...",
        noSkillsFound: "No skills match your search.",
        categories: {
          search: {
            title: "Search & Read Emails",
            description: "Search and read emails from your Outlook inbox",
          },
          drafts: {
            title: "Draft Emails",
            description: "Create, edit, and manage email drafts",
          },
          send: {
            title: "Send Emails",
            description: "Send new emails or reply to messages immediately",
          },
          account: {
            title: "Integration Statistics",
            description: "View mailbox statistics and account information",
          },
        },
        skills: {
          getInbox: {
            title: "Get Inbox",
            description: "Get recent emails from your Outlook inbox",
          },
          search: {
            title: "Search Emails",
            description: "Search emails using Microsoft Search syntax",
          },
          readThread: {
            title: "Read Conversation",
            description: "Read a full email conversation thread",
          },
          createDraft: {
            title: "Create Draft",
            description:
              "Create a new draft email or draft reply to an existing message",
          },
          updateDraft: {
            title: "Update Draft",
            description: "Update an existing draft email",
          },
          listDrafts: {
            title: "List Drafts",
            description: "List all draft emails",
          },
          deleteDraft: {
            title: "Delete Draft",
            description: "Delete a draft email",
          },
          sendDraft: {
            title: "Send Draft",
            description: "Send an existing draft email",
          },
          sendEmail: {
            title: "Send Email",
            description:
              "Send a new email or reply to an existing message immediately",
          },
          getMailboxStats: {
            title: "Mailbox Stats",
            description: "Get folder counts and mailbox statistics",
          },
        },
      },
    },
    skill_files: {
      title: "Skill Files",
      description:
        "Point CometStream at a folder of SKILL.md skills (like Claude/ZCode skills). Skills load live from disk and appear to the agent as tools with their instructions.",
      "directory-placeholder": "C:\\Code\\AiSKill\\skills",
      "save-directory": "Save",
      "directory-saved": "Skills directory saved.",
      "save-failed": "Failed to save skill files setting.",
      loading: "Loading skill files",
      "none-configured":
        "No skills directory configured yet. Enter a folder path above to load SKILL.md skills.",
      "none-found":
        "No SKILL.md skills found in this directory. Each skill is a subfolder containing a SKILL.md file.",
      "tool-name": "Agent tool name",
    },
    mcp: {
      title: "MCP Servers",
      "loading-from-config": "Loading MCP Servers from configuration file",
      "learn-more": "Learn more about MCP Servers.",
      "no-servers-found": "No MCP servers found",
      "tool-warning":
        "For the best performance, consider disabling unwanted tools to conserve context.",
      "tools-enabled": "tools enabled",
      "stop-server": "Stop MCP Server",
      "start-server": "Start MCP Server",
      "delete-server": "Delete MCP Server",
      "add-server": "Add MCP Server",
      "edit-server": "Edit MCP Server",
      "add-server-subtitle":
        "Define a local (stdio) or remote (http) MCP server. It is saved to the config file and started immediately.",
      presets: "Quick Add",
      "server-name": "Server Name",
      "name-locked-when-editing":
        "The server name cannot be changed after creation.",
      "transport-type": "Transport Type",
      command: "Command",
      arguments: "Arguments",
      "args-hint": "Space-separated. Quote values containing spaces.",
      "env-vars": "Environment Variables",
      "server-url": "Server URL",
      headers: "Headers",
      "create-server": "Create Server",
      "save-changes": "Save Changes",
      cancel: "Cancel",
      "save-failed": "Failed to save MCP server.",
      "create-success": "MCP server {{name}} created.",
      "update-success": "MCP server {{name}} updated.",
      "tool-count-warning":
        "This MCP server has <b>{{count}} tools enabled</b> that will consume context in every chat.<br />Consider disabling unwanted tools to conserve context.",
      "startup-command": "Startup Command",
      "not-running-warning":
        "This MCP server is not running - it may be stopped or experiencing an error on startup.",
      "tool-call-arguments": "Tool call arguments",
    },
    settings: {
      title: "Agent Skill Settings",
      "max-tool-calls": {
        title: "Max Tool Calls Per Response",
        description:
          "The maximum number of tools an agent can chain to generate a single response. This prevents runaway tool calls and infinite loops.",
      },
      "intelligent-skill-selection": {
        title: "Intelligent Skill Selection",
        description:
          "Enable unlimited tools and cut token usage by up to 80% per query — AnythingLLM automatically selects the right skills for every prompt.",
        "max-tools": {
          title: "Max Tools",
          description:
            "The maximum number of tools to select for each query. We recommend setting this to higher values for larger context models.",
        },
      },
      "clarifying-questions": {
        title: "Allow agent to ask clarifying questions",
        "beta-badge": "BETA",
        description:
          "When enabled, agents can pause to ask short clarifying questions if your prompt is ambiguous.",
        "max-per-turn": {
          title: "Max questions per turn",
          description:
            "How many clarifying questions the agent may ask in a single survey.",
        },
      },
      "plan-mode": {
        title: "Auto-approve implementation plans",
        description:
          "When enabled (default), plans submitted with exit-plan-mode approve immediately and the run keeps building. Turn it off to review and Approve/Reject every design first.",
      },
    },
  },
  recorded: {
    title: "Workspace Chats",
    description:
      "These are all the recorded chats and messages that have been sent by users ordered by their creation date.",
    export: "Export",
    table: {
      id: "ID",
      by: "Sent By",
      workspace: "Workspace",
      prompt: "Prompt",
      response: "Response",
      at: "Sent At",
    },
  },
  customization: {
    interface: {
      title: "UI Preferences",
      description: "Set your UI preferences for AnythingLLM.",
    },
    branding: {
      title: "Branding & Whitelabeling",
      description:
        "White-label your AnythingLLM instance with custom branding.",
    },
    chat: {
      title: "Chat",
      description: "Set your chat preferences for AnythingLLM.",
      auto_submit: {
        title: "Auto-Submit Speech Input",
        description:
          "Automatically submit speech input after a period of silence",
      },
      auto_speak: {
        title: "Auto-Speak Responses",
        description: "Automatically speak responses from the AI",
      },
      spellcheck: {
        title: "Enable Spellcheck",
        description: "Enable or disable spellcheck in the chat input field",
      },
    },
    items: {
      theme: {
        title: "Theme",
        description: "Select your preferred color theme for the application.",
      },
      "show-scrollbar": {
        title: "Show Scrollbar",
        description: "Enable or disable the scrollbar in the chat window.",
      },
      "disable-auto-scroll": {
        title: "Disable Auto-Scroll",
        description:
          "Disable automatic scrolling to the bottom of the chat when new messages are received.",
      },
      "support-email": {
        title: "Support Email",
        description:
          "Set the support email address that should be accessible by users when they need help.",
      },
      "app-name": {
        title: "Name",
        description:
          "Set a name that is displayed on the login page to all users.",
      },
      "display-language": {
        title: "Display Language",
        description:
          "Select the preferred language to render AnythingLLM's UI in - when translations are available.",
      },
      logo: {
        title: "Brand Logo",
        description: "Upload your custom logo to showcase on all pages.",
        add: "Add a custom logo",
        recommended: "Recommended size: 800 x 200",
        remove: "Remove",
        replace: "Replace",
      },
      "browser-appearance": {
        title: "Browser Appearance",
        description:
          "Customize the appearance of the browser tab and title when the app is open.",
        tab: {
          title: "Title",
          description:
            "Set a custom tab title when the app is open in a browser.",
        },
        favicon: {
          title: "Favicon",
          description: "Use a custom favicon for the browser tab.",
        },
      },
      "sidebar-footer": {
        title: "Sidebar Footer Items",
        description:
          "Customize the footer items displayed on the bottom of the sidebar.",
        icon: "Icon",
        link: "Link",
      },
      "render-html": {
        title: "Render HTML in chat",
        description:
          "Render HTML responses in assistant responses.\nThis can result in a much higher fidelity of response quality, but can also lead to potential security risks.",
      },
    },
  },
  api: {
    title: "API Keys",
    description:
      "API keys allow the holder to programmatically access and manage this AnythingLLM instance.",
    link: "Read the API documentation",
    generate: "Generate New API Key",
    empty: "No API keys found",
    actions: "Actions",
    messages: {
      error: "Error: {{error}}",
    },
    modal: {
      title: "Create new API key",
      cancel: "Cancel",
      close: "Close",
      create: "Create API Key",
      helper:
        "Once created the API key can be used to programmatically access and configure this AnythingLLM instance.",
      name: {
        label: "Name",
        placeholder: "Production integration",
        helper:
          "Optional. Use a friendly name so you can identify this key later.",
      },
    },
    row: {
      copy: "Copy API Key",
      copied: "Copied",
      unnamed: "--",
      deleteConfirm:
        "Are you sure you want to deactivate this api key?\nAfter you do this it will not longer be useable.\n\nThis action is irreversible.",
    },
    table: {
      name: "Name",
      key: "API Key",
      by: "Created By",
      created: "Created",
    },
  },
  llm: {
    title: "LLM Preference",
    description:
      "These are the credentials and settings for your preferred LLM chat & embedding provider. It is important that these keys are current and correct, or else AnythingLLM will not function properly.",
    provider: "LLM Provider",
    providers: {
      azure_openai: {
        azure_service_endpoint: "Azure Service Endpoint",
        api_key: "API Key",
        chat_deployment_name: "Chat Deployment Name",
        chat_model_token_limit: "Chat Model Token Limit",
        model_type: "Model Type",
        model_type_tooltip:
          "If your deployment uses a reasoning model (o1, o1-mini, o3-mini, etc.), set this to “Reasoning”. Otherwise, your chat requests may fail.",
        default: "Default",
        reasoning: "Reasoning",
      },
    },
  },
  "model-router": {
    title: "Model Routers",
    description:
      "Model routers let you define rules to automatically route chat messages to different LLM providers and models based on conditions.",
    table: {
      name: "Name",
      fallback: "Fallback",
      rules: "Rules",
      workspaces: "Workspaces",
    },
    "no-routers": "No model routers yet",
    "empty-description":
      "No model routers configured yet. Create one to get started.",
    "new-router-button": "New Router",
    "delete-confirm":
      'Are you sure you want to delete the router "{{name}}"?\nThis will remove all its rules and unlink any workspaces using it.\n\nThis action is irreversible.',
    "toast-deleted": "Router deleted",
    "toast-delete-failed": "Failed to delete router: {{error}}",
    "new-router": {
      title: "Create New Model Router",
      name: "Name",
      "name-placeholder": "e.g. Cost Optimizer",
      description: "Description",
      "description-placeholder": "Optional description",
      "fallback-label": "Primary Provider & Model",
      "fallback-description":
        "Used when no routing rule matches. Also used to evaluate LLM-classified rules.",
      "cooldown-label": "Cache Cooldown (seconds)",
      "cooldown-help":
        "How long a routing decision is cached before re-evaluating rules. Set to 0 to disable caching.",
      "name-required": "Name is required.",
      "fallback-required": "Primary provider and model are required.",
      cancel: "Cancel",
      create: "Create Router",
    },
    "edit-router": {
      "back-to-routers": "Back to Model Routers",
      title: "Edit Router: {{name}}",
      save: "Save Changes",
      "toast-update-failed": "Failed to update router",
    },
    rules: {
      title: "Routing Rules",
      "title-with-name": "Router Rules: {{name}}",
      description:
        "Define the rules that determine when and how chat messages go to specific providers and models.",
      "add-rule": "Add Rule",
      "delete-confirm": 'Delete rule "{{title}}"?',
      "toast-delete-failed": "Failed to delete rule",
      "toast-reorder-failed": "Failed to reorder rules",
      "no-rules": "No rules yet",
      "empty-description":
        "Add a rule to start routing chat messages to specific providers and models.",
      "new-rule-button": "New Rule",
      "calculated-section-label":
        "Calculated rules — evaluated first, in priority order",
      "llm-section-label":
        "LLM rules — evaluated as a batch if no calculated rule matched",
      "llm-rule-body":
        'Match <desc>"{{description}}"</desc> then route to <route>{{route}}</route>',
      "calculated-no-conditions":
        "No conditions — route to <route>{{route}}</route>",
      "calculated-single-condition":
        'If <prop>{{property}}</prop> {{comparator}} <val>"{{value}}"</val> then route to <route>{{route}}</route>',
      "calculated-multi-condition":
        "If {{quantifier}} of <cond>{{conditions}}</cond> then route to <route>{{route}}</route>",
      "comparator-contains": "contains",
      "comparator-matches": "matches",
      "comparator-between": "between",
      "badge-llm": "LLM",
      "badge-calculated": "Calculated",
      "aria-drag-to-reorder": "Drag to reorder",
      "aria-edit-rule": "Edit rule",
      "aria-delete-rule": "Delete rule",
      "quantifier-any": "ANY",
      "quantifier-all": "ALL",
    },
    "rule-form": {
      "title-label": "Title",
      "rule-type": "Rule Type",
      "property-label": "Property",
      "property-select": "Select",
      "comparator-label": "Comparator",
      "comparator-select": "Select",
      "value-label": "Value",
      "add-condition": "Add condition",
      "remove-condition": "Remove condition",
      "conditions-incomplete":
        "Condition {{index}} is incomplete — fill in property, comparator, and value.",
      "match-description-label": "Match Description",
      "match-description-placeholder":
        "e.g. The user is asking about legal topics, contracts, or compliance",
      "match-description-help":
        "Describe the situation when you want this rule to match. This is evaluated by your LLM to determine if it should be used.",
      "route-to-label": "Route to Provider & Model",
      "route-to-description": "When this rule matches, use this provider/model",
      cancel: "Cancel",
      saving: "Saving...",
      "update-rule": "Update Rule",
      "create-rule": "Create Rule",
      "title-required": "Title is required",
      "toast-save-failed": "Failed to save rule",
      "type-calculated-label": "Calculated",
      "type-calculated-description":
        "Match based on message properties like content, token count, or time of day.",
      "type-llm-label": "LLM Classified",
      "type-llm-description":
        "Use an LLM to classify the message based on a description you provide.",
      "prop-prompt-content": "Prompt Content",
      "prop-token-count": "Conversation Token Count",
      "prop-message-count": "Conversation Message Count",
      "prop-current-hour": "Current Hour (0-23)",
      "prop-has-image": "Has Image Attachment",
      "cmp-contains": "contains",
      "cmp-matches-regex": "matches (regex)",
      "cmp-equals": "equals",
      "cmp-not-equals": "not equals",
      "cmp-greater-than": "greater than",
      "cmp-greater-than-or-equal": "greater than or equal",
      "cmp-less-than": "less than",
      "cmp-less-than-or-equal": "less than or equal",
      "cmp-between": "between (inclusive)",
      "placeholder-between-hour": "e.g. 9,17 (9am to 5pm)",
      "placeholder-between-numeric": "e.g. 10,50",
      "placeholder-hour": "e.g. 18 (0-23)",
      "placeholder-message-count": "e.g. 10",
      "placeholder-numeric": "e.g. 4000",
      "placeholder-contains": "e.g. code, python, rust",
      "placeholder-matches": "e.g. /\\bpython\\b/i",
      "placeholder-default": "e.g. code",
      "help-contains":
        "Comma-separated list — matches if the prompt contains any of the values (case-insensitive).",
      "help-matches":
        "Regex pattern. Use /pattern/flags for case sensitivity (defaults to case-insensitive).",
      "bool-true": "True",
      "bool-false": "False",
    },
    "provider-picker": {
      "select-provider": "Select provider",
      "setup-required": "(setup required)",
      "loading-models": "Loading models...",
      "select-model": "Select model",
      "enter-model": "Enter model name",
      "select-provider-first": "Select a provider first",
      "configure-to-continue": "Configure {{name}} to continue",
      "configure-provider": "Configure {{name}}",
      "setup-credentials":
        "Enter the required credentials to use {{name}} as a routing target.",
      cancel: "Cancel",
      "save-settings": "Save settings",
      "toast-save-failed": "Failed to save settings: {{error}}",
    },
    "router-selection": {
      "loading-routers": "Loading custom routers...",
      "no-routers-prefix-settings": "No model routers configured yet.",
      "no-routers-prefix-workspace": "No model routers configured.",
      "no-routers-link": "Create one in Model Router settings",
      "model-router-label": "Model Router",
      "select-router": "Select a router",
      "select-description": "Select which router to use for this workspace.",
      "no-routers-chat":
        "No routers configured. Create one in Settings > AI Providers > Model Router.",
      "rule-count": "({{count}} rules)",
    },
    metrics: {
      "model-router-default": "Model Router",
    },
    chat: {
      "select-router-error": "Select a router",
      "invalid-model": "Invalid model selection",
      "routed-to": "Routed to <route>{{model}}</route>",
      "routed-to-rule":
        "Routed to <route>{{model}}</route> via <rule>{{ruleTitle}}</rule>",
    },
  },
  transcription: {
    title: "Transcription Model Preference",
    description:
      "These are the credentials and settings for your preferred transcription model provider. Its important these keys are current and correct or else media files and audio will not transcribe.",
    provider: "Transcription Provider",
    "warn-start":
      "Using the local whisper model on machines with limited RAM or CPU can stall AnythingLLM when processing media files.",
    "warn-recommend":
      "We recommend at least 2GB of RAM and upload files <10Mb.",
    "warn-end":
      "The built-in model will automatically download on the first use.",
  },
  embedding: {
    title: "Embedding Preference",
    "desc-start":
      "When using an LLM that does not natively support an embedding engine - you may need to additionally specify credentials for embedding text.",
    "desc-end":
      "Embedding is the process of turning text into vectors. These credentials are required to turn your files and prompts into a format which AnythingLLM can use to process.",
    provider: {
      title: "Embedding Provider",
    },
  },
  imageGeneration: {
    title: "Image Generation Preference",
    description:
      "Configure the provider used to generate images from the /img chat command.",
    provider: "Image Generation Provider",
    card: {
      "failed-to-load": "Image failed to load",
      "alt-text": "Generated image",
      edit: "Edit",
      download: "Download",
    },
    pending: {
      heading: "Generating your image…",
      description:
        "This can take a little while. It'll appear here as soon as it's ready.",
      aborted: "Image generation was aborted",
    },
  },
  text: {
    title: "Text splitting & Chunking Preferences",
    "desc-start":
      "Sometimes, you may want to change the default way that new documents are split and chunked before being inserted into your vector database.",
    "desc-end":
      "You should only modify this setting if you understand how text splitting works and it's side effects.",
    size: {
      title: "Text Chunk Size",
      description:
        "This is the maximum length of characters that can be present in a single vector.",
      recommend: "Embed model maximum length is",
    },
    overlap: {
      title: "Text Chunk Overlap",
      description:
        "This is the maximum overlap of characters that occurs during chunking between two adjacent text chunks.",
    },
  },
  vector: {
    title: "Vector Database",
    description:
      "These are the credentials and settings for how your AnythingLLM instance will function. It's important these keys are current and correct.",
    provider: {
      title: "Vector Database Provider",
      description: "There is no configuration needed for LanceDB.",
    },
  },
  embeddable: {
    title: "Embeddable Chat Widgets",
    description:
      "Embeddable chat widgets are public facing chat interfaces that are tied to a single workspace. These allow you to build workspaces that then you can publish to the world.",
    create: "Create embed",
    table: {
      workspace: "Workspace",
      chats: "Sent Chats",
      active: "Active Domains",
      created: "Created",
    },
  },
  "embed-chats": {
    title: "Embed Chat History",
    export: "Export",
    description:
      "These are all the recorded chats and messages from any embed that you have published.",
    table: {
      embed: "Embed",
      sender: "Sender",
      message: "Message",
      response: "Response",
      at: "Sent At",
    },
  },
  telegram: {
    title: "Telegram Bot",
    description:
      "Connect your AnythingLLM instance to Telegram so you can chat with your workspaces from any device.",
    setup: {
      step1: {
        title: "Step 1: Create your Telegram bot",
        description:
          "Open @BotFather in Telegram, send <code>/newbot</code> to <code>@BotFather</code>, follow the prompts, and copy the API token.",
        "open-botfather": "Open BotFather",
        "instruction-1": "1. Open the link or scan the QR code",
        "instruction-2":
          "2. Send <code>/newbot</code> to <code>@BotFather</code>",
        "instruction-3": "3. Choose a name and username for your bot",
        "instruction-4": "4. Copy the API token you receive",
      },
      step2: {
        title: "Step 2: Connect your bot",
        description:
          "Paste the API token you received from @BotFather to connect your bot.",
        "bot-token": "Bot Token",
        connecting: "Connecting...",
        "connect-bot": "Connect Bot",
      },
      security: {
        title: "Recommended Security Settings",
        description:
          "For additional security, configure these settings in @BotFather.",
        "disable-groups": "— Prevent adding bot to groups",
        "disable-inline": "— Prevent bot from being used in inline search",
        "obscure-username":
          "Use a non-obvious bot handle username to reduce discoverability",
      },
      "toast-enter-token": "Please enter a bot token.",
      "toast-connect-failed": "Failed to connect bot.",
    },
    connected: {
      status: "Connected",
      "status-disconnected": "Disconnected — token may be expired or invalid",
      "placeholder-token": "Paste new bot token...",
      reconnect: "Reconnect",
      workspace: "Workspace",
      "bot-link": "Bot Link",
      "voice-response": "Voice Response",
      disconnecting: "Disconnecting...",
      disconnect: "Disconnect",
      "voice-text-only": "Text only",
      "voice-mirror": "Mirror (reply with voice when user sends voice)",
      "voice-always": "Always voice (send audio with every reply)",
      "toast-disconnect-failed": "Failed to disconnect bot.",
      "toast-reconnect-failed": "Failed to reconnect bot.",
      "toast-voice-failed": "Failed to update voice mode.",
      "toast-approve-failed": "Failed to approve user.",
      "toast-deny-failed": "Failed to deny user.",
      "toast-revoke-failed": "Failed to revoke user.",
    },
    users: {
      "pending-description":
        "Users waiting to be verified. Match the pairing code shown here with the one displayed in their Telegram chat.",
      unknown: "Unknown",
    },
  },
  security: {
    title: "Security",
    multiuser: {
      title: "Multi-User Mode",
      description:
        "Set up your instance to support your team by activating Multi-User Mode.",
      enable: {
        "is-enable": "Multi-User Mode is Enabled",
        enable: "Enable Multi-User Mode",
        description:
          "By default, you will be the only admin. As an admin you will need to create accounts for all new users or admins. Do not lose your password as only an Admin user can reset passwords.",
        username: "Admin account username",
        password: "Admin account password",
      },
    },
    password: {
      title: "Password Protection",
      description:
        "Protect your AnythingLLM instance with a password. If you forget this there is no recovery method so ensure you save this password.",
      "password-label": "Instance Password",
    },
  },
  event: {
    title: "Event Logs",
    description:
      "View all actions and events happening on this instance for monitoring.",
    clear: "Clear Event Logs",
    table: {
      type: "Event Type",
      user: "User",
      occurred: "Occurred At",
    },
  },
  privacy: {
    title: "Privacy & Data-Handling",
    description:
      "This is your configuration for how connected third party providers and AnythingLLM handle your data.",
    anonymous: "Anonymous Telemetry Enabled",
  },
  connectors: {
    "search-placeholder": "Search data connectors",
    "no-connectors": "No data connectors found.",
    obsidian: {
      vault_location: "Vault Location",
      vault_description:
        "Select your Obsidian vault folder to import all notes and their connections.",
      selected_files: "Found {{count}} markdown files",
      importing: "Importing vault...",
      import_vault: "Import Vault",
      processing_time:
        "This may take a while depending on the size of your vault.",
      vault_warning:
        "To avoid any conflicts, make sure your Obsidian vault is not currently open.",
    },
    github: {
      name: "GitHub Repo",
      description:
        "Import an entire public or private GitHub repository in a single click.",
      URL: "GitHub Repo URL",
      URL_explained: "Url of the GitHub repo you wish to collect.",
      token: "GitHub Access Token",
      optional: "optional",
      token_explained: "Access Token to prevent rate limiting.",
      token_explained_start: "Without a ",
      token_explained_link1: "Personal Access Token",
      token_explained_middle:
        ", the GitHub API may limit the number of files that can be collected due to rate limits. You can ",
      token_explained_link2: "create a temporary Access Token",
      token_explained_end: " to avoid this issue.",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from.",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>GitHub Access Token</b> this data connector will only be able to collect the <b>top-level</b> files of the repo due to GitHub's public API rate-limits.",
      token_personal:
        "Get a free Personal Access Token with a GitHub account here.",
    },
    gitlab: {
      name: "GitLab Repo",
      description:
        "Import an entire public or private GitLab repository in a single click.",
      URL: "GitLab Repo URL",
      URL_explained: "URL of the GitLab repo you wish to collect.",
      token: "GitLab Access Token",
      optional: "optional",
      token_description:
        "Select additional entities to fetch from the GitLab API.",
      token_explained_start: "Without a ",
      token_explained_link1: "Personal Access Token",
      token_explained_middle:
        ", the GitLab API may limit the number of files that can be collected due to rate limits. You can ",
      token_explained_link2: "create a temporary Access Token",
      token_explained_end: " to avoid this issue.",
      fetch_issues: "Fetch Issues as Documents",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>GitLab Access Token</b> this data connector will only be able to collect the <b>top-level</b> files of the repo due to GitLab's public API rate-limits.",
      token_personal:
        "Get a free Personal Access Token with a GitLab account here.",
    },
    gitea: {
      name: "Gitea Repo",
      description:
        "Import an entire public or private repository from any Gitea instance in a single click.",
      URL: "Gitea Repo URL",
      URL_explained:
        "Url of the repo you wish to collect on your Gitea instance - self-hosted instances are supported.",
      token: "Gitea Access Token",
      optional: "optional",
      token_explained:
        "Access Token required to collect private repositories or repos on instances that require authentication.",
      token_explained_start: "Without an ",
      token_explained_link1: "Access Token",
      token_explained_end:
        ", only repositories that your Gitea instance exposes publicly can be collected.",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from.",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>Gitea Access Token</b> this data connector will only be able to collect files from repositories that are <b>publicly readable</b> on your Gitea instance.",
    },
    youtube: {
      name: "YouTube Transcript",
      description:
        "Import the transcription of an entire YouTube video from a link.",
      URL: "YouTube Video URL",
      URL_explained_start:
        "Enter the URL of any YouTube video to fetch its transcript. The video must have ",
      URL_explained_link: "closed captions",
      URL_explained_end: " available.",
      task_explained:
        "Once complete, the transcript will be available for embedding into workspaces in the document picker.",
    },
    "website-depth": {
      name: "Bulk Link Scraper",
      description: "Scrape a website and its sub-links up to a certain depth.",
      URL: "Website URL",
      URL_explained: "URL of the website you want to scrape.",
      depth: "Crawl Depth",
      depth_explained:
        "This is the number of child-links that the worker should follow from the origin URL.",
      max_pages: "Maximum Pages",
      max_pages_explained: "Maximum number of links to scrape.",
      task_explained:
        "Once complete, all scraped content will be available for embedding into workspaces in the document picker.",
    },
    confluence: {
      name: "Confluence",
      description: "Import an entire Confluence page in a single click.",
      deployment_type: "Confluence deployment type",
      deployment_type_explained:
        "Determine if your Confluence instance is hosted on Atlassian cloud or self-hosted.",
      base_url: "Confluence base URL",
      base_url_explained: "This is the base URL of your Confluence space.",
      space_key: "Confluence space key",
      space_key_explained:
        "This is the spaces key of your confluence instance that will be used. Usually begins with ~",
      username: "Confluence Username",
      username_explained: "Your Confluence username",
      auth_type: "Confluence Auth Type",
      auth_type_explained:
        "Select the authentication type you want to use to access your Confluence pages.",
      auth_type_username: "Username and Access Token",
      auth_type_personal: "Personal Access Token",
      token: "Confluence Access Token",
      token_explained_start:
        "You need to provide an access token for authentication. You can generate an access token",
      token_explained_link: "here",
      token_desc: "Access token for authentication",
      pat_token: "Confluence Personal Access Token",
      pat_token_explained: "Your Confluence personal access token.",
      bypass_ssl: "Bypass SSL Certificate Validation",
      bypass_ssl_explained:
        "Enable this option to bypass SSL certificate validation for self-hosted confluence instances with self-signed certificate",
      task_explained:
        "Once complete, the page content will be available for embedding into workspaces in the document picker.",
    },
    manage: {
      documents: "Documents",
      "data-connectors": "Data Connectors",
      "desktop-only":
        "Editing these settings are only available on a desktop device. Please access this page on your desktop to continue.",
      dismiss: "Dismiss",
      editing: "Editing",
    },
    directory: {
      "my-documents": "My Documents",
      "new-folder": "New Folder",
      "total-documents_one": "{{count}} document",
      "total-documents_other": "{{count}} documents",
      "search-results_one": "{{count}} result",
      "search-results_other": "{{count}} results",
      "search-document": "Search for document",
      "no-documents": "No Documents",
      "move-workspace": "Move to Workspace",
      "delete-confirmation":
        "Are you sure you want to delete these files and folders?\nThis will remove the files from the system and remove them from any existing workspaces automatically.\nThis action is not reversible.",
      "removing-message":
        "Removing {{count}} documents and {{folderCount}} folders. Please wait.",
      "move-success": "Successfully moved {{count}} documents.",
      no_docs: "No Documents",
      select_all: "Select All",
      deselect_all: "Deselect All",
      remove_selected: "Remove Selected",
      save_embed: "Save and Embed",
    },
    upload: {
      "processor-offline": "Document Processor Unavailable",
      "processor-offline-desc":
        "We can't upload your files right now because the document processor is offline. Please try again later.",
      "click-upload": "Click to upload or drag and drop",
      "file-types":
        "supports text files, csv's, spreadsheets, audio files, and more!",
      "or-submit-link": "or submit a link",
      "placeholder-link": "https://example.com",
      fetching: "Fetching...",
      "fetch-website": "Fetch website",
      "privacy-notice":
        "These files will be uploaded to the document processor running on this AnythingLLM instance. These files are not sent or shared with a third party.",
    },
    pinning: {
      what_pinning: "What is document pinning?",
      pin_explained_block1:
        "When you <b>pin</b> a document in AnythingLLM we will inject the entire content of the document into your prompt window for your LLM to fully comprehend.",
      pin_explained_block2:
        "This works best with <b>large-context models</b> or small files that are critical to its knowledge-base.",
      pin_explained_block3:
        "If you are not getting the answers you desire from AnythingLLM by default then pinning is a great way to get higher quality answers in a click.",
      accept: "Okay, got it",
    },
    watching: {
      what_watching: "What does watching a document do?",
      watch_explained_block1:
        "When you <b>watch</b> a document in AnythingLLM we will <i>automatically</i> sync your document content from it's original source on regular intervals. This will automatically update the content in every workspace where this file is managed.",
      watch_explained_block2:
        "This feature currently supports online-based content and will not be available for manually uploaded documents.",
      watch_explained_block3_start:
        "You can manage what documents are watched from the ",
      watch_explained_block3_link: "File manager",
      watch_explained_block3_end: " admin view.",
      accept: "Okay, got it",
    },
  },
  agent_panel: {
    title: "Agent",
    open: "Open agent panel",
    close: "Close panel",
    tab_plan: "Plan",
    tab_changes: "Changes",
    tab_sources: "Sources",
    tab_sessions: "Sessions",
    tab_trajectory: "Trajectory",
    trajectory_empty:
      "Per-turn model requests will appear here while the agent works.",
    trajectory_tools: "Requested tools",
    trajectory_messages: "+{{count}} messages",
    trajectory_cache_hit: "{{pct}}% cached",
    plan_empty:
      "The agent's plan will appear here when it starts a multi-step task.",
    plan_now: "Now",
    plan_more: "+{{count}} more",
    plan_title: "Implementation plan",
    plan_proposed: "Proposed",
    plan_approved: "Approved",
    plan_rejected: "Rejected",
    plan_streaming: "Receiving plan… {{count}} chars",
    changes_empty:
      "File changes the agent makes will be listed here with their diffs.",
    sessions_empty:
      "Terminal runs and subagent tasks will appear here while the agent works. Click any row for full output.",
    sessions_running: "running",
    sessions_filter_all: "All",
    sessions_filter_terminal: "Terminal",
    sessions_filter_subagent: "Subagents",
    sessions_filter_empty: "Nothing here for this filter yet.",
    similar_runs: "{{count}} similar runs",
    similar_iterations: "{{count}} similar iterations",
    show_all: "Show all {{count}}",
    show_recent: "Show recent",
    progress: "{{done}} of {{total}} steps",
    status_done: "Done",
    status_in_progress: "In progress",
    status_pending: "Pending",
    changes_total_one: "{{count}} file",
    changes_total_other: "{{count}} files",
    file_viewer: {
      back: "Back to panel",
      not_found: "File not found in the agent workspace.",
      not_previewable: "Preview is not available for this file type.",
      too_large: "File is too large to preview.",
      truncated: "Showing the first part of this file.",
      lines_capped: "Showing the first {{count}} lines.",
      open_failed: "Could not open this file.",
    },
  },
  chat_header: {
    workspace: "Workspace",
    thread: "Thread",
  },
  permission: {
    title: "Tool approval",
    mode_ask: "Ask every time",
    mode_ask_description: "Confirm each tool call before it runs.",
    mode_auto: "Auto-approve",
    mode_auto_description: "Approve tool calls in this chat automatically.",
    mode_auto_remember: "Auto-approve & remember",
    mode_auto_remember_description:
      "Approve automatically and whitelist each tool permanently.",
  },
  agent_summary: {
    title: "Agent finished work",
    worked_for: "Worked for {{duration}}",
    files_changed_one: "{{count}} file changed",
    files_changed_other: "{{count}} files changed",
  },
  chat_window: {
    attachments_processing: "Attachments are processing. Please wait...",
    generating_response: "Generating response",
    thought_in_progress: "Model is Thinking...",
    thoughts: "Thoughts",
    file_change: {
      edited_file: "Edited file {{path}}",
      created_file: "Created file {{path}}",
      read_file: "Read file {{path}}",
      writing_file: "Writing file {{path}}",
      verb_edit: "Edited",
      verb_create: "Created",
      verb_read: "Read",
      writing: "Writing",
      lines_one: "{{count}} line",
      lines_other: "{{count}} lines",
      diff_capped: "Diff truncated for display",
    },
    trace: {
      thought: "Thought",
    },
    file: {
      download: "Download",
    },
    response_failed: "Could not respond to message.",
    response_failed_reason: "Reason: {{reason}}",
    send_message: "Send a message",
    attach_file: "Attach a file to this chat",
    text_size: "Change text size.",
    export: "Export chat as...",
    exporting: "Exporting...",
    microphone: "Speak your prompt.",
    stt_unsupported: "Microphone access is not supported in this browser.",
    stt_mic_denied:
      "Could not access the microphone. Please grant permission and try again.",
    stt_transcription_failed: "Transcription failed: {{error}}",
    send: "Send prompt message to workspace",
    tts_speak_message: "TTS Speak message",
    copy: "Copy",
    regenerate: "Regenerate",
    regenerate_response: "Regenerate response",
    good_response: "Good response",
    more_actions: "More actions",
    sources: "Sources",
    source_count_one: "{{count}} reference",
    source_count_other: "{{count}} references",
    document: "Document",
    similarity_match: "match",
    fork: "Fork",
    delete: "Delete",
    cancel: "Cancel",
    submit: "Submit",
    edit_prompt: "Edit prompt",
    edit_response: "Edit response",
    edit_info_user:
      '"Submit" regenerates the AI response. "Save" updates your message only.',
    edit_info_assistant:
      "Your changes will be saved directly to this response.",
    see_less: "See Less",
    see_more: "See More",
    preset_reset_description: "Clear your chat history and begin a new chat",
    preset_compact_description:
      "Summarize the conversation so far to free up context",
    preset_img_description: "Generate an image from a text prompt",
    add_new_preset: " Add New Preset",
    add_new: "Add new",
    edit: "Edit",
    publish: "Publish",
    stop_generating: "Stop generating response",
    command: "Command",
    your_command: "your-command",
    placeholder_prompt:
      "This is the content that will be injected in front of your prompt.",
    description: "Description",
    placeholder_description: "Responds with a poem about LLMs.",
    save: "Save",
    small: "Small",
    normal: "Normal",
    large: "Large",
    tools: "Tools",
    text_size_label: "Text Size",
    select_model: "Select Model",
    slash_commands: "Slash Commands",
    agent_skills: "Agent Skills",
    manage_agent_skills: "Manage Agent Skills",
    app_integrations: "App Integrations",
    custom_skills: "Custom Skills",
    skill_files: "Skill Files",
    agent_flows: "Agent Flows",
    sub_skills: "Sub-skills",
    no_tools_found: "No matching tools found",
    loading_mcp_servers: "Loading MCP servers...",
    start_agent_session: "Start Agent Session",
    sessions_terminal: "Terminal sessions",
    sessions_subagents: "Subagent runs",
    agent_skills_disabled_in_session:
      "Can't modify skills during an active agent session. Use /exit to end the session first.",
    queue: {
      title: "Queued ({{count}})",
      continue: "Continue queue",
      halted:
        "Queue paused — the last run stopped or errored. Nothing was deleted.",
      edit_blocked:
        "Clear the message box first, then edit the queued message.",
      move_up: "Move up",
      move_down: "Move down",
      edit: "Edit queued message",
      delete: "Delete queued message",
    },
    use_agent_session_to_use_tools:
      "You can use tools in chat by starting an agent session with '@agent' at the beginning of your prompt.",
    workspace_llm_manager: {
      search: "Search",
      loading_workspace_settings: "Loading workspace settings...",
      available_models: "Available Models for {{provider}}",
      available_models_description: "Select a model to use for this workspace.",
      save: "Use this model",
      saving: "Setting model as workspace default...",
      missing_credentials: "This provider is missing credentials!",
      missing_credentials_description: "Set up now",
    },
    agent_invocation: {
      model_wants_to_call: "Model wants to call",
      approve: "Approve",
      reject: "Reject",
      always_allow: "Always allow {{skillName}}",
      tool_call_was_approved: "Tool call was approved",
      tool_call_was_rejected: "Tool call was rejected",
      clarifying_skip: "Let agent decide",
      clarifying_submit: "Submit",
      clarifying_skipped: "You let the agent decide.",
      clarifying_timeout: "No response submitted in time.",
      clarifying_pagination: "{{current}} of {{total}}",
      clarifying_prev_aria: "Previous question",
      clarifying_next_aria: "Next question",
      clarifying_close_aria: "Close and skip",
      clarifying_other: "Other",
      clarifying_other_placeholder: "Type your answer",
      batch_progress: "{{answered}} of {{total}} answered",
      batch_skip_this: "Skip",
      batch_submit_all: "Submit all",
      batch_next: "Next",
      answer_skipped: "[user skipped]",
    },
    compact: {
      compressing: "Compressing context",
      compressed: "Context compressed",
      failed: "Could not compress context",
      nothing: "Nothing to compact yet - the conversation is still short",
      messages: "message",
      messages_other: "messages",
      tokens_freed: "tokens freed",
      summary_label: "Compacted summary",
      no_session: "Nothing to compact yet - start an agent conversation first",
    },
    jump: {
      label: "Conversation turns",
      jump_to_message: "Jump to message",
    },
    memories: {
      title: "Memories",
      empty:
        "No memories so far. After you interact with the chatbot more memories will fill in or",
      empty_cta: "create a new memory",
      tab_workspace: "Workspace",
      tab_global: "Global",
      toggle: {
        label: "Enable Personalization",
        description:
          "Allow your assistant to recall facts about you or this workspace and use them in conversations",
      },
      auto_extraction: {
        label: "Automatic Memories",
        description:
          "Have your assistant automatically create memories in the background",
      },
      menu: {
        edit: "Edit",
        delete: "Delete",
        move_to_global: "Move to Global",
        move_to_workspace: "Move to Workspace",
      },
      modal: {
        create_title: "Create Memory",
        edit_title: "Edit Memory",
        create_description:
          'Memories should be a single, concise statement. e.g. "User prefers Python over JavaScript"',
        edit_description: "Update the content of this memory.",
        label: "Memory",
        placeholder: "e.g. User's name is Joe, User works on AnythingLLM, etc.",
        create: "Create",
        save: "Save",
        cancel: "Cancel",
      },
    },
    leave_generating: {
      title: "Stop generating response?",
      description:
        "You are about to leave this chat, this will stop the model from generating the response and it cannot be recovered.",
      cancel: "Cancel",
      confirm: "Continue",
    },
  },
  profile_settings: {
    edit_account: "Edit Account",
    profile_picture: "Profile Picture",
    remove_profile_picture: "Remove Profile Picture",
    username: "Username",
    new_password: "New Password",
    password_description: "Password must be at least 8 characters long",
    cancel: "Cancel",
    update_account: "Update Account",
    theme: "Theme Preference",
    language: "Preferred language",
    failed_upload: "Failed to upload profile picture: {{error}}",
    upload_success: "Profile picture uploaded.",
    failed_remove: "Failed to remove profile picture: {{error}}",
    profile_updated: "Profile updated.",
    failed_update_user: "Failed to update user: {{error}}",
    account: "Account",
    support: "Support",
    signout: "Sign out",
  },
  "keyboard-shortcuts": {
    title: "Keyboard Shortcuts",
    shortcuts: {
      settings: "Open Settings",
      workspaceSettings: "Open Current Workspace Settings",
      home: "Go to Home",
      workspaces: "Manage Workspaces",
      apiKeys: "API Keys Settings",
      llmPreferences: "LLM Preferences",
      chatSettings: "Chat Settings",
      help: "Show keyboard shortcuts help",
      showLLMSelector: "Show workspace LLM Selector",
      commandPalette: "Open command palette",
    },
  },
  community_hub: {
    publish: {
      system_prompt: {
        success_title: "Success!",
        success_description:
          "Your System Prompt has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish System Prompt",
        name_label: "Name",
        name_description: "This is the display name of your system prompt.",
        name_placeholder: "My System Prompt",
        description_label: "Description",
        description_description:
          "This is the description of your system prompt. Use this to describe the purpose of your system prompt.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your system prompt for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        public_description: "Public system prompts are visible to everyone.",
        private_description: "Private system prompts are only visible to you.",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        prompt_label: "Prompt",
        prompt_description:
          "This is the actual system prompt that will be used to guide the LLM.",
        prompt_placeholder: "Enter your system prompt here...",
      },
      agent_flow: {
        success_title: "Success!",
        success_description:
          "Your Agent Flow has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish Agent Flow",
        name_label: "Name",
        name_description: "This is the display name of your agent flow.",
        name_placeholder: "My Agent Flow",
        description_label: "Description",
        description_description:
          "This is the description of your agent flow. Use this to describe the purpose of your agent flow.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your agent flow for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        submitting: "Publishing...",
        submit: "Publish to Community Hub",
        privacy_note:
          "Agent flows are always uploaded as private to protect any sensitive data. You can change the visibility in the Community Hub after publishing. Please verify your flow does not contain any sensitive or private information before publishing.",
      },
      slash_command: {
        success_title: "Success!",
        success_description:
          "Your Slash Command has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish Slash Command",
        name_label: "Name",
        name_description: "This is the display name of your slash command.",
        name_placeholder: "My Slash Command",
        description_label: "Description",
        description_description:
          "This is the description of your slash command. Use this to describe the purpose of your slash command.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your slash command for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        public_description: "Public slash commands are visible to everyone.",
        private_description: "Private slash commands are only visible to you.",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        prompt_label: "Prompt",
        prompt_description:
          "This is the prompt that will be used when the slash command is triggered.",
        prompt_placeholder: "Enter your prompt here...",
      },
      generic: {
        unauthenticated: {
          title: "Authentication Required",
          description:
            "You need to authenticate with the AnythingLLM Community Hub before publishing items.",
          button: "Connect to Community Hub",
        },
      },
    },
  },
  scheduledJobs: {
    title: "Scheduled Jobs",
    enableNotifications: "Enable browser notifications for job results",
    description:
      "Create recurring AI tasks that run on a schedule. Each job runs a prompt with optional tools and saves the result for review.",
    newJob: "New Job",
    loading: "Loading...",
    emptyTitle: "No Scheduled Jobs yet",
    emptySubtitle: "Create one to get started.",
    table: {
      name: "Name",
      schedule: "Schedule",
      status: "Status",
      lastRun: "Last Run",
      nextRun: "Next Run",
      actions: "Actions",
    },
    confirmDelete: "Are you sure you want to delete this scheduled job?",
    status: {
      completed: "Completed",
      failed: "Failed",
      timed_out: "Timed out",
      running: "Running",
      queued: "Queued",
    },
    toast: {
      deleted: "Job deleted",
      triggered: "Job triggered successfully",
      triggerFailed: "Failed to trigger job",
      triggerSkipped: "A run is already in progress for this job",
      killed: "Job stopped successfully",
      killFailed: "Failed to stop job",
    },
    row: {
      neverRun: "Never run",
      viewRuns: "View runs",
      runNow: "Run now",
      enable: "Enable",
      disable: "Disable",
      edit: "Edit",
      delete: "Delete",
    },
    modal: {
      titleEdit: "Edit Scheduled Job",
      titleNew: "New Scheduled Job",
      nameLabel: "Name",
      namePlaceholder: "e.g. Daily News Digest",
      promptLabel: "Prompt",
      promptPlaceholder: "The instruction to run on each execution...",
      scheduleLabel: "Schedule",
      modeBuilder: "Builder",
      modeCustom: "Custom",
      cronPlaceholder: "Cron expression (e.g. 0 9 * * *)",
      currentSchedule: "Current schedule:",
      toolsLabel: "Tools (Optional)",
      toolsDescription:
        "Select which agent tools this job can use. If none are selected, the job runs without any tools.",
      toolsSearch: "Search",
      toolsNoResults: "No tools match",
      required: "Required",
      requiredFieldsBanner:
        "Please fill out all required fields in order to create job.",
      cancel: "Cancel",
      saving: "Saving...",
      updateJob: "Update Job",
      createJob: "Create Job",
      jobUpdated: "Job updated",
      jobCreated: "Job created",
    },
    builder: {
      fallbackWarning:
        "This expression can't be edited visually. Switch to Custom to keep it, or change anything below to overwrite it.",
      run: "Run",
      frequency: {
        minute: "every minute",
        hour: "hourly",
        day: "daily",
        week: "weekly",
        month: "monthly",
      },
      every: "Every",
      minuteOne: "1 minute",
      minuteOther: "{{count}} minutes",
      atMinute: "At minute",
      pastEveryHour: "past every hour",
      at: "At",
      on: "On",
      onDay: "On day",
      ofEveryMonth: "of every month",
      weekdays: {
        sun: "Sun",
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
      },
    },
    runHistory: {
      back: "Back to jobs",
      title: "Run History: {{name}}",
      schedule: "Schedule:",
      emptyTitle: "No runs yet for this job",
      emptySubtitle: "Run the job now and view its results.",
      runNow: "Run Now",
      stopJob: "Stop job",
      table: {
        status: "Status",
        started: "Started",
        duration: "Duration",
        error: "Error",
      },
    },
    runDetail: {
      loading: "Loading run details...",
      notFound: "Run not found.",
      back: "Back",
      unknownJob: "Unknown Job",
      runHeading: "{{name}} — Run #{{id}}",
      duration: "Duration: {{value}}",
      continueInThread: "Continue in Chat",
      creating: "Creating...",
      threadFailed: "Failed to create thread",
      stopJob: "Stop Job",
      killing: "Stopping...",
      sections: {
        prompt: "Prompt",
        error: "Error",
        thinking: "Thoughts ({{count}})",
        toolCalls: "Tool Calls ({{count}})",
        files: "Files ({{count}})",
        response: "Response",
        metrics: "Metrics",
      },
      metrics: {
        promptTokens: "Prompt tokens:",
        completionTokens: "Completion tokens:",
      },
    },
    toolCall: {
      arguments: "Arguments:",
      showResult: "Show result",
      hideResult: "Hide result",
    },
    file: {
      unknown: "Unknown file",
      download: "Download",
      downloadFailed: "Failed to download file",
      types: {
        powerpoint: "PowerPoint",
        pdf: "PDF Document",
        word: "Word Document",
        spreadsheet: "Spreadsheet",
        generic: "File",
      },
    },
  },
  desktop: {
    titlebar: {
      windowControls: "Window controls",
      minimize: "Minimize",
      maximize: "Maximize",
      restore: "Restore",
      close: "Close",
    },
  },
  model_selector: {
    select_model: "Select model",
    search_models: "Search models...",
    loading: "Loading models...",
    no_models: "No models found. Configure a provider or add a custom one.",
    admin_only_models:
      "Only an admin can list and switch models. Ask your admin to configure providers.",
    custom_badge: "custom",
    vision_badge: "Vision",
    reasoning_badge: "Reasoning",
    reasoning: "Reasoning",
    reasoning_value_off: "Off",
    reasoning_value_on: "On",
    manage_models: "Manage models",
    switched_toast: "Switched to {{model}}",
    model_router: "Model router",
    custom_provider: "Custom provider",
  },
  context_ring: {
    title: "Context window",
    loading: "Measuring context usage...",
    unknown_limit:
      "Context window size is not known for this model, so usage is not shown.",
    messages: "Messages ({{count}})",
    system_prompt: "System prompt",
    attachments: "Attachments",
    estimated: "Estimates.",
    live_run: "Live run",
    rounds: "Rounds ({{count}})",
    cache_hit: "Cache hit",
    speed: "Speed tok/s",
    speed_value: "last {{last}} · avg {{avg}} · max {{max}}",
    tool_calls: "Tool calls ({{count}})",
    kind_mcp: "MCP",
    kind_terminal: "Terminal",
    kind_subagent: "Subagent",
    kind_files: "Files",
    kind_builtin: "Built-in",
    live_note: "Rounds ↑in ↓out are real · tools ~estimates.",
  },
  manage_models: {
    title: "Model settings",
    subtitle:
      "Manage custom model providers. Once configured, they can be selected during chat.",
    providers: "Providers",
    custom_providers: "Custom providers",
    no_builtin_providers: "No configured providers",
    no_custom_providers: "No custom providers yet",
    add_provider: "Add provider",
    add_provider_subtitle:
      "Connect any OpenAI-compatible endpoint. Models can then be added with their context window and capabilities.",
    select_provider: "Select a provider to manage it",
    builtin_description:
      "This provider is configured with its API key in the system LLM settings. Its model list is discovered automatically from the provider.",
    open_llm_settings: "Open system LLM settings",
    delete_provider_confirm:
      'Delete provider "{{name}}" and all of its model configurations?',
    provider_deleted: "Provider deleted",
    provider_created: "Provider created",
    connection_saved: "Connection saved",
    model_added: "Model added",
    field_name: "Name",
    field_base_url: "Base URL",
    field_api_key: "API key",
    api_key_unchanged: "Unchanged",
    save: "Save",
    delete_provider: "Delete",
    models: "Models",
    add_model: "Add model",
    no_models: "No models added yet",
    remove_model: "Remove model",
    connected: "Ready",
    ssrf_note:
      "Only public http(s) endpoints can be connected. Local and private network addresses are rejected.",
    creating: "Creating...",
    create: "Create provider",
    set_default: "Set as default",
    set_default_hint:
      "Makes this provider's first enabled model the system-wide default for new chats and agents.",
    default_set: "System default provider updated",
    default_badge: "Default",
    field_model_id: "Model ID",
    field_display_name: "Display name",
    field_context_window: "Context window (tokens)",
    field_max_output: "Max output tokens",
    advanced: "Advanced",
    capability_vision: "Vision input",
    capability_tools: "Tool calling",
    field_reasoning_levels: "Reasoning effort levels",
    reasoning_levels_hint:
      "Comma-separated levels the model accepts (e.g. low, medium, high). Leave empty for a simple on/off toggle.",
    adding: "Adding...",
    add: "Add model",
    fetch_models: "Fetch models from the API",
    fetch_empty:
      "The endpoint returned no models - enter the model ID manually.",
  },
  mode_selector: {
    title: "Chat mode",
    chat: "Chat",
    query: "Query docs",
    agent: "Agent",
    chat_description: "Chat with your documents and general knowledge.",
    query_description: "Answer strictly from this workspace's documents.",
    agent_description:
      "Every message runs the agent with tools and skills access.",
    agent_skills: "Agent skills & tools",
  },
};

export default TRANSLATIONS;
