import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VPS_API = process.env.VPS_API || "http://50.6.249.30:3000";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const server = new Server(
  { name: "district-scraper-mcp", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

/* ── Helpers ── */

async function queryEvents(filters = {}) {
  let query = supabase.from("scraped_events").select("*");
  if (filters.event_type) query = query.eq("event_type", filters.event_type);
  if (filters.review_status) query = query.eq("review_status", filters.review_status);
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,location.ilike.%${filters.search}%`);
  if (filters.min_confidence) query = query.gte("confidence", parseInt(filters.min_confidence));
  if (filters.limit) query = query.limit(Math.min(parseInt(filters.limit), 100));
  else query = query.limit(50);
  if (filters.offset) query = query.offset(parseInt(filters.offset));
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { events: data || [] };
}

async function queryRuns(filters = {}) {
  let query = supabase.from("scraper_runs").select("*");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.limit) query = query.limit(Math.min(parseInt(filters.limit), 50));
  else query = query.limit(25);
  if (filters.offset) query = query.offset(parseInt(filters.offset));
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { runs: data || [] };
}

async function getStats() {
  const [eventsRes, runsRes, pendingRes] = await Promise.all([
    supabase.from("scraped_events").select("*", { count: "exact", head: true }),
    supabase.from("scraper_runs").select("*", { count: "exact", head: true }),
    supabase.from("scraped_events").select("*", { count: "exact", head: true }).eq("review_status", "pending"),
  ]);
  return {
    total_events: eventsRes.count || 0,
    total_runs: runsRes.count || 0,
    pending_review: pendingRes.count || 0,
  };
}

/* ── Tools ── */

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_events",
      description: "List scraped events with optional filters. Returns title, date, location, price, confidence, review status.",
      inputSchema: {
        type: "object",
        properties: {
          event_type: { type: "string", enum: ["Event", "Movie", "Restaurant", "Other"], description: "Filter by event type" },
          review_status: { type: "string", enum: ["pending", "approved", "rejected", "edited"], description: "Filter by review status" },
          search: { type: "string", description: "Search by title, description, or location" },
          min_confidence: { type: "number", description: "Minimum confidence score (0-100)" },
          limit: { type: "number", description: "Max results (default 50, max 100)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_event",
      description: "Get full details of a single event by ID. Includes raw_data, confidence breakdown, and review status.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Event UUID" },
        },
        required: ["id"],
      },
    },
    {
      name: "search_events",
      description: "Full-text search across event titles, descriptions, and locations.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: ["query"],
      },
    },
    {
      name: "list_runs",
      description: "List scrape runs with job status, event counts, and error info.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["queued", "running", "completed", "failed"], description: "Filter by run status" },
          limit: { type: "number", description: "Max results (default 25, max 50)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_run",
      description: "Get full details of a scrape run including all logs.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Run UUID" },
        },
        required: ["id"],
      },
    },
    {
      name: "trigger_scrape",
      description: "Trigger a new scrape job for a city via the VPS worker. Returns job ID.",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string", description: "City slug (e.g. mumbai, delhi-ncr, bangalore)" },
        },
        required: ["city"],
      },
    },
    {
      name: "get_stats",
      description: "Get aggregate statistics: total events, total runs, items pending review.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_events": {
        const result = await queryEvents(args || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result.events, null, 2) }],
        };
      }

      case "get_event": {
        const { data, error } = await supabase
          .from("scraped_events")
          .select("*, scraper_runs!inner(city, city_slug, status)")
          .eq("id", args.id)
          .single();
        if (error) throw new Error(error.message || "Event not found");
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "search_events": {
        const result = await queryEvents({ search: args.query, limit: args.limit || 20 });
        return {
          content: [{ type: "text", text: JSON.stringify(result.events, null, 2) }],
        };
      }

      case "list_runs": {
        const result = await queryRuns(args || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result.runs, null, 2) }],
        };
      }

      case "get_run": {
        const [runRes, logsRes] = await Promise.all([
          supabase.from("scraper_runs").select("*").eq("id", args.id).single(),
          supabase.from("scraper_logs").select("*").eq("run_id", args.id).order("created_at", { ascending: true }),
        ]);
        if (runRes.error) throw new Error(runRes.error.message || "Run not found");
        return {
          content: [
            { type: "text", text: JSON.stringify(runRes.data, null, 2) },
            { type: "text", text: "\n--- Logs ---\n" + JSON.stringify(logsRes.data || [], null, 2) },
          ],
        };
      }

      case "trigger_scrape": {
        const cityNames = {
          "delhi-ncr": "Delhi/NCR", mumbai: "Mumbai", bangalore: "Bangalore",
          pune: "Pune", chennai: "Chennai", hyderabad: "Hyderabad",
          kolkata: "Kolkata", ahmedabad: "Ahmedabad", jaipur: "Jaipur",
          chandigarh: "Chandigarh",
        };
        const cityName = cityNames[args.city] || args.city;
        const res = await fetch(`${VPS_API}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: args.city, cityName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scrape request failed");
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_stats": {
        const stats = await getStats();
        return {
          content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

/* ── Resources ── */

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "events://list",
      name: "All Events",
      description: "All scraped events (latest 50)",
      mimeType: "application/json",
    },
    {
      uri: "runs://list",
      name: "All Runs",
      description: "All scrape runs (latest 25)",
      mimeType: "application/json",
    },
    {
      uri: "stats://summary",
      name: "Summary Statistics",
      description: "Aggregate stats: total events, runs, pending review",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  try {
    if (uri === "events://list") {
      const result = await queryEvents({ limit: 50 });
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result.events, null, 2) }] };
    }
    if (uri === "runs://list") {
      const result = await queryRuns({ limit: 25 });
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result.runs, null, 2) }] };
    }
    if (uri === "stats://summary") {
      const stats = await getStats();
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(stats, null, 2) }] };
    }
    if (uri.startsWith("events://")) {
      const id = uri.replace("events://", "");
      const { data, error } = await supabase.from("scraped_events").select("*").eq("id", id).single();
      if (error) throw new Error("Event not found");
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    }
    if (uri.startsWith("runs://")) {
      const id = uri.replace("runs://", "");
      const { data, error } = await supabase.from("scraper_runs").select("*").eq("id", id).single();
      if (error) throw new Error("Run not found");
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown resource: ${uri}`);
  } catch (err) {
    return { contents: [{ uri, mimeType: "text/plain", text: `Error: ${err.message}` }] };
  }
});

/* ── Start ── */

const transport = new StdioServerTransport();
await server.connect(transport);
