"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Shield, Search, Cpu, Layers, Map as MapIcon, BookOpen, 
  TrendingUp, CheckCircle, AlertTriangle, XCircle, Plus, 
  Sliders, Navigation, Users, BarChart2, CornerDownRight, 
  Clock, ArrowRight, RotateCw, MapPin, Database, Award, Send, AlertCircle,
  Play, Pause, Server, Wifi, CloudRain
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell 
} from 'recharts';
import 'leaflet/dist/leaflet.css';

const API_URL = "http://127.0.0.1:8000";

interface Event {
  id: number;
  original_id: string;
  event_cause: string;
  event_type: string;
  zone: string;
  junction: string;
  latitude: number;
  longitude: number;
  start_datetime: string;
  end_datetime: string;
  closed_datetime: string;
  requires_road_closure: number;
  priority: string;
  description: string;
  duration: number;
  generated_description: string;
  impact_score: number;
  risk_level: string;
  duration_category: string;
  area_impact: string;
  manpower_officers: number;
  manpower_patrols: number;
  manpower_supervisors: number;
  barricades_count: number;
  barricades_placement: string;
  diversion_route_a: string;
  diversion_route_b: string;
  diversion_route_c: string;
  diversion_reasoning: string;
  outcome: string;
  feedback: string;
  similarity_score?: number;
  impact_radius_m?: number;
  impact_radius_km?: number;
  affected_junctions?: number;
  affected_roads?: number;
  severity_level?: string;
  live_traffic_snapshot?: string;
}

interface TomMemoryRecord {
  id: number;
  event_id: number;
  predicted_impact: number;
  recommended_officers: number;
  recommended_patrols: number;
  recommended_supervisors: number;
  recommended_barricades: number;
  actual_impact: number;
  actual_officers: number;
  actual_barricades: number;
  actual_outcome: string;
  feedback: string;
  timestamp: string;
  event_cause: string;
  event_type: string;
  zone: string;
  junction: string;
  generated_description: string;
  live_traffic_snapshot?: string;
  impact_radius_m?: number;
  diversion_chosen?: string;
  officers_dispatched?: string;
  response_time_mins?: number;
  success_rating?: number;
}

interface ZoneRisk {
  zone: string;
  event_count: number;
  avg_impact: number;
  risk_score: number;
  today_score: number;
  weekly_score: number;
  monthly_score: number;
  latitude: number;
  longitude: number;
}

interface Metrics {
  overall: {
    avg_impact_accuracy: number;
    avg_resource_accuracy: number;
    avg_diversion_success_rate: number;
    total_feedback_runs: number;
  };
  history: Array<{
    run: number;
    impact_accuracy: number;
    resource_accuracy: number;
    diversion_success: number;
    date: string;
  }>;
  outcomes: Record<string, number>;
}

interface Officer {
  id: number;
  officer_name: string;
  latitude: number;
  longitude: number;
  status: string;
  distance_km?: number;
  eta_mins?: number;
}

interface Dispatch {
  id: number;
  event_id: number;
  officer_ids: string;
  barricades_count: number;
  diversion_route: string;
  status: string;
  dispatch_message: string;
  timestamp: string;
  junction: string;
  event_cause: string;
  risk_level: string;
  impact_score: number;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('command-center');
  const [eventsData, setEventsData] = useState<{events: Event[], total_count: number}>({events: [], total_count: 0});
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [zoneRiskData, setZoneRiskData] = useState<ZoneRisk[]>([]);
  const [tomRecords, setTomRecords] = useState<TomMemoryRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  
  // Phase 2 States
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [liveTraffic, setLiveTraffic] = useState<any>(null);
  const [impactRadiusM, setImpactRadiusM] = useState<number>(250);
  const [impactRadiusKm, setImpactRadiusKm] = useState<number>(0.25);
  const [affectedJunctions, setAffectedJunctions] = useState<number>(4);
  const [affectedRoads, setAffectedRoads] = useState<number>(6);
  const [severityLevel, setSeverityLevel] = useState<string>("Medium");
  const [diversionRoutes, setDiversionRoutes] = useState<any[]>([]);
  const [geojsonVisualizations, setGeojsonVisualizations] = useState<any>(null);
  const [autonomousAlert, setAutonomousAlert] = useState<any>(null);
  
  // TOM Incidents Database States
  const [tomIncidents, setTomIncidents] = useState<Event[]>([]);
  const [tomIncidentsPage, setTomIncidentsPage] = useState(1);
  const [tomIncidentsTotal, setTomIncidentsTotal] = useState(0);
  const [tomIncidentsSearch, setTomIncidentsSearch] = useState('');
  const [tomIncidentsCause, setTomIncidentsCause] = useState('All');
  const [tomIncidentsRisk, setTomIncidentsRisk] = useState('All');
  const [tomIncidentsLoading, setTomIncidentsLoading] = useState(false);
  
  // Geocoding States
  const [searchQuery, setSearchQuery] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geocodedAddress, setGeocodedAddress] = useState<string>('');

  // Manual Dispatch States
  const [manualDispatchOpen, setManualDispatchOpen] = useState(false);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<number[]>([]);
  
  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New Event Form State (Enhanced)
  const [newEvent, setNewEvent] = useState({
    event_cause: 'vehicle_breakdown',
    event_type: 'unplanned',
    zone: 'Central Zone 2',
    junction: 'M.G. Road',
    latitude: 12.9716,
    longitude: 77.5946,
    requires_road_closure: false,
    duration: 60,
    priority: 'Low',
    description: ''
  });

  const [customCause, setCustomCause] = useState('');

  const [durationInputVal, setDurationInputVal] = useState(60);
  const [durationUnit, setDurationUnit] = useState<'mins' | 'hrs'>('mins');
  const [showHoneycomb, setShowHoneycomb] = useState(false);
  const [highlightedRouteIndex, setHighlightedRouteIndex] = useState<number | null>(0);

  // Reset highlightedRouteIndex on event switch
  useEffect(() => {
    setHighlightedRouteIndex(0);
  }, [selectedEvent]);

  // Sync duration inputs to newEvent duration
  useEffect(() => {
    const mins = durationUnit === 'hrs' ? durationInputVal * 60 : durationInputVal;
    setNewEvent(prev => ({ ...prev, duration: mins }));
  }, [durationInputVal, durationUnit]);

  // Search Tab State
  const [customSearchText, setCustomSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Event[]>([]);
  const [searching, setSearching] = useState(false);

  // Copilot Simulator State
  const [simulatedImpact, setSimulatedImpact] = useState(50);
  const [simulatedDuration, setSimulatedDuration] = useState(120);
  const [simulatedClosure, setSimulatedClosure] = useState(false);
  const [simulatedJunction, setSimulatedJunction] = useState("Richmond Circle");

  // Post-Event Learning Form State (Upgraded)
  const [feedbackForm, setFeedbackForm] = useState({
    event_id: '',
    actual_impact: 50,
    actual_officers: 4,
    actual_barricades: 5,
    actual_outcome: 'Successful',
    feedback_text: '',
    // Phase 2 Upgrade Fields
    actual_impact_radius_m: 250,
    diversion_chosen: 'Route A (Primary Bypass)',
    response_time_mins: 12,
    success_rating: 9
  });

  // Unique Causes & Zones
  const causes = ['vehicle_breakdown', 'accident', 'tree_fall', 'water_logging', 'pot_holes', 'congestion', 'construction', 'vip_movement', 'procession', 'protest', 'debris', 'others'];
  const zones = ['Central Zone 1', 'Central Zone 2', 'West Zone 1', 'West Zone 2', 'North Zone 1', 'North Zone 2', 'South Zone 1', 'South Zone 2', 'East Zone 1', 'East Zone 2'];

  // Waterlogging states
  const [waterloggingData, setWaterloggingData] = useState<any>(null);
  const [predictingWaterlogging, setPredictingWaterlogging] = useState(false);
  const [simulateHeavyRain, setSimulateHeavyRain] = useState(false);

  const runWaterloggingPrediction = async () => {
    setPredictingWaterlogging(true);
    try {
      const res = await fetch(`${API_URL}/api/waterlogging/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulate_heavy_rain: simulateHeavyRain
        })
      });
      if (res.ok) {
        const data = await res.json();
        setWaterloggingData(data);
        // Refresh officer status list
        const offRes = await fetch(`${API_URL}/api/officers`);
        if (offRes.ok) {
          const oData = await offRes.json();
          setOfficers(oData);
        }
        // Refresh dispatches list
        const dispRes = await fetch(`${API_URL}/api/dispatches`);
        if (dispRes.ok) {
          const dData = await dispRes.json();
          setDispatches(dData);
        }
      } else {
        alert("Failed to predict waterlogging. Make sure the backend server is running.");
      }
    } catch (err) {
      console.error("Error predicting waterlogging:", err);
    } finally {
      setPredictingWaterlogging(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'waterlogging' && !waterloggingData) {
      runWaterloggingPrediction();
    }
  }, [activeTab]);

  // Astram Simulator States
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamLogs, setStreamLogs] = useState<Array<{id: string, time: string, message: string, type: 'info' | 'success' | 'warn' | 'error' | 'step'}>>([]);
  const [streamedEvents, setStreamedEvents] = useState<any[]>([]);
  const [streamSpeed, setStreamSpeed] = useState(5000); // 5 seconds default
  const [streamStats, setStreamStats] = useState({ totalProcessed: 0, autoDispatches: 0, totalImpactScore: 0 });
  const [currentStepEvent, setCurrentStepEvent] = useState<any>(null);
  const [simulationStatus, setSimulationStatus] = useState<'idle' | 'fetching' | 'synthesizing' | 'predicting' | 'dispatching' | 'completed'>('idle');

  // Helper function for description generation
  const generateDescriptionFromParams = (event_cause: string, event_type: string, zone: string, junction: string, requires_road_closure: boolean, duration: number) => {
    const plannedStr = event_type.toLowerCase() === 'planned' ? 'A planned' : 'An unplanned';
    const cause = event_cause.replace(/_/g, ' ');
    const zoneStr = (zone && zone.toLowerCase() !== 'unknown zone') ? ` in ${zone}` : '';
    const junctionStr = (junction && junction.toLowerCase() !== 'unknown junction') ? ` at ${junction}` : '';
    const closureStr = requires_road_closure ? ' requiring road closure' : ' with no road closure';
    const durationStr = (duration && duration > 0) ? ` and lasting approximately ${Math.round(duration)} minutes` : '';
    return `${plannedStr} ${cause} event${zoneStr}${junctionStr}${closureStr}${durationStr}.`;
  };

  const addLog = (message: string, type: 'info' | 'success' | 'warn' | 'error' | 'step') => {
    const time = new Date().toLocaleTimeString();
    const id = Math.random().toString(36).substring(2, 9);
    setStreamLogs(prev => [{ id, time, message, type }, ...prev].slice(0, 100));
  };

  const simulateStep = async () => {
    setSimulationStatus('fetching');
    addLog("Polling next raw telemetry packet from Astram Event Stream API...", 'info');
    
    try {
      const fetchRes = await fetch(`${API_URL}/api/simulation/random-event`);
      if (!fetchRes.ok) throw new Error("Connection to Astram data source failed.");
      const rawEvent = await fetchRes.json();
      
      setCurrentStepEvent(rawEvent);
      addLog(`Telemetry Ingested: Row ID ${rawEvent.id} | Cause: ${rawEvent.event_cause.toUpperCase()} at ${rawEvent.junction}.`, 'step');
      
      setSimulationStatus('synthesizing');
      await new Promise(resolve => setTimeout(resolve, 800));
      addLog("EventDNA Synthesizer compiling structural details and text fields...", 'info');
      
      setSimulationStatus('predicting');
      await new Promise(resolve => setTimeout(resolve, 800));
      addLog("Sending payload to Sentence-BERT & GBDT Regressor for impact prediction...", 'info');
      
      const postRes = await fetch(`${API_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_cause: rawEvent.event_cause,
          event_type: rawEvent.event_type,
          zone: rawEvent.zone,
          junction: rawEvent.junction,
          latitude: rawEvent.latitude,
          longitude: rawEvent.longitude,
          requires_road_closure: rawEvent.requires_road_closure,
          duration: rawEvent.duration,
          priority: rawEvent.priority,
          description: rawEvent.description,
          start_datetime: rawEvent.start_datetime
        })
      });
      
      if (!postRes.ok) throw new Error("FastAPI Event Ingestion endpoint failed.");
      const result = await postRes.json();
      
      // Update local lists
      setEventsData(prev => ({
        events: [result.event, ...prev.events],
        total_count: prev.total_count + 1
      }));
      
      const offRes = await fetch(`${API_URL}/api/officers`);
      if (offRes.ok) setOfficers(await offRes.json());
      const dispRes = await fetch(`${API_URL}/api/dispatches`);
      if (dispRes.ok) setDispatches(await dispRes.json());
      
      addLog(`S-BERT Embedded text description. FAISS matched ${result.predictions.similar_events?.length || 0} similar cases.`, 'info');
      addLog(`XGBoost predicted fused impact score: ${result.predictions.predicted_impact} (${result.predictions.risk_level} Risk).`, 'success');
      
      setSimulationStatus('dispatching');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const isDispatched = result.autonomous_dispatch.triggered;
      if (isDispatched) {
        addLog(`[AUTONOMOUS DISPATCH] Fused Impact ${result.predictions.predicted_impact} > 50.0 threshold. Triggering units.`, 'warn');
        addLog(`Dispatched nearest units: ${result.autonomous_dispatch.order.officer_names}.`, 'success');
        addLog(`Mock SMS notification successfully dispatched via SMS Gateway.`, 'info');
      } else {
        addLog(`No autonomous dispatch triggered. (Impact ${result.predictions.predicted_impact} <= 50.0 threshold).`, 'info');
      }
      
      setSimulationStatus('completed');
      addLog(`SQLite Database state committed. Event ID #${result.event.id} registered.`, 'success');
      
      setStreamedEvents(prev => [result, ...prev]);
      setStreamStats(prev => ({
        totalProcessed: prev.totalProcessed + 1,
        autoDispatches: prev.autoDispatches + (isDispatched ? 1 : 0),
        totalImpactScore: prev.totalImpactScore + result.predictions.predicted_impact
      }));
      
    } catch (err: any) {
      addLog(`Simulation Error: ${err.message}`, 'error');
      setSimulationStatus('idle');
    }
  };

  // Simulation Loop Effect
  useEffect(() => {
    let timer: any;
    if (isStreaming) {
      simulateStep();
      timer = setInterval(() => {
        simulateStep();
      }, streamSpeed);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isStreaming, streamSpeed]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Events
      const eventsRes = await fetch(`${API_URL}/api/events?page=1&page_size=30`);
      if (!eventsRes.ok) throw new Error("Failed to connect to API backend. Make sure the FastAPI server is running on localhost:8000.");
      const eventsData = await eventsRes.json();
      setEventsData(eventsData);
      
      // 2. Fetch Officers
      const officersRes = await fetch(`${API_URL}/api/officers`);
      if (officersRes.ok) {
        const oData = await officersRes.json();
        setOfficers(oData);
      }

      // 3. Fetch Dispatches
      const dispatchesRes = await fetch(`${API_URL}/api/dispatches`);
      if (dispatchesRes.ok) {
        const dData = await dispatchesRes.json();
        setDispatches(dData);
      }

      if (eventsData.events && eventsData.events.length > 0) {
        const firstEvent = eventsData.events[0];
        handleSelectEvent(firstEvent);
      }

      // 4. Fetch Zone Risk
      const zoneRes = await fetch(`${API_URL}/api/zone-risk`);
      if (zoneRes.ok) {
        const zData = await zoneRes.json();
        setZoneRiskData(zData);
      }

      // 5. Fetch TOM Memory
      const tomRes = await fetch(`${API_URL}/api/tom?limit=50`);
      if (tomRes.ok) {
        const tData = await tomRes.json();
        setTomRecords(tData);
      }

      // 6. Fetch Metrics
      const metricsRes = await fetch(`${API_URL}/api/metrics`);
      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        setMetrics(mData);
      }

    } catch (err: any) {
      setError(err.message || "Failed to load data from backend server.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial data on mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchTomIncidents = async () => {
    setTomIncidentsLoading(true);
    try {
      let url = `${API_URL}/api/events?page=${tomIncidentsPage}&page_size=10`;
      if (tomIncidentsSearch.trim()) {
        url += `&query=${encodeURIComponent(tomIncidentsSearch)}`;
      }
      if (tomIncidentsCause !== 'All') {
        url += `&event_cause=${encodeURIComponent(tomIncidentsCause)}`;
      }
      if (tomIncidentsRisk !== 'All') {
        url += `&risk_level=${encodeURIComponent(tomIncidentsRisk)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTomIncidents(data.events || []);
        setTomIncidentsTotal(data.total_count || 0);
      }
    } catch (err) {
      console.error("Error fetching TOM incidents:", err);
    } finally {
      setTomIncidentsLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm("Are you sure you want to delete this incident record? This will permanently remove the event, its dispatches, post-event metrics, and any logged TOM records.")) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/events/${eventId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchTomIncidents();
        fetchInitialData();
        alert("Incident and all related operational logs deleted successfully.");
      } else {
        alert("Failed to delete the incident. Please try again.");
      }
    } catch (err) {
      console.error("Error deleting event:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'tom') {
      fetchTomIncidents();
    }
  }, [activeTab, tomIncidentsPage, tomIncidentsSearch, tomIncidentsCause, tomIncidentsRisk]);

  const handleSelectEvent = async (event: Event) => {
    setSelectedEvent(event);
    setAutonomousAlert(null); // Clear any active alerts

    // Fetch fused context & routing vectors dynamically
    try {
      const res = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_cause: event.event_cause,
          event_type: event.event_type,
          zone: event.zone,
          junction: event.junction,
          requires_road_closure: event.requires_road_closure === 1,
          duration: event.duration,
          priority: event.priority,
          latitude: event.latitude,
          longitude: event.longitude
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLiveTraffic(data.live_traffic);
        setImpactRadiusM(data.impact_radius_m);
        setImpactRadiusKm(data.impact_radius_km);
        setAffectedJunctions(data.affected_junctions);
        setAffectedRoads(data.affected_roads);
        setSeverityLevel(data.severity_level);
        setDiversionRoutes(data.diversion_routes);
        setGeojsonVisualizations(data.geojson_visualizations);
      }
    } catch (err) {
      console.error("Error loading event geolocated context:", err);
    }

    // Populate simulator
    setSimulatedImpact(Math.round(event.impact_score));
    setSimulatedDuration(event.duration);
    setSimulatedClosure(event.requires_road_closure === 1);
    setSimulatedJunction(event.junction);
    
    // Populate feedback form
    setFeedbackForm({
      event_id: String(event.id),
      actual_impact: Math.round(event.impact_score),
      actual_officers: event.manpower_officers,
      actual_barricades: event.barricades_count,
      actual_outcome: event.outcome === 'Active' ? 'Successful' : event.outcome,
      feedback_text: event.feedback || '',
      actual_impact_radius_m: event.impact_radius_m || 250,
      diversion_chosen: event.diversion_route_a ? 'Route A (Primary Bypass)' : 'Route B (Arterial Bypass)',
      response_time_mins: 15,
      success_rating: 8
    });
  };

  // geocode Search
  const handleGeocodeSearch = async () => {
    if (!searchQuery.trim()) return;
    setGeocoding(true);
    try {
      const res = await fetch(`${API_URL}/api/geocode?query=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Location not found");
      const data = await res.json();
      setNewEvent(prev => ({
        ...prev,
        latitude: data.latitude,
        longitude: data.longitude,
        junction: data.address.split(',')[0]
      }));
      setGeocodedAddress(data.address);
    } catch (err: any) {
      alert("Geocoding failed. Using nearest match fallback.");
    } finally {
      setGeocoding(false);
    }
  };

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        // Check if coordinates are in Bangalore boundaries
        const isWithinBangalore = (lat >= 12.80 && lat <= 13.15) && (lon >= 77.30 && lon <= 77.85);
        
        if (!isWithinBangalore) {
          alert(`Your live location (${lat.toFixed(4)}, ${lon.toFixed(4)}) is outside the Bangalore operational boundary. Clamping to nearest boundary.`);
        }
        
        const clampedLat = Math.min(13.15, Math.max(12.80, lat));
        const clampedLon = Math.min(77.85, Math.max(77.30, lon));
        
        setNewEvent(prev => ({
          ...prev,
          latitude: clampedLat,
          longitude: clampedLon,
          junction: `Live Location (${clampedLat.toFixed(4)}, ${clampedLon.toFixed(4)})`
        }));
        
        setSearchQuery(`Live Location (${clampedLat.toFixed(4)}, ${clampedLon.toFixed(4)})`);
        setGeocodedAddress(`Live Location (${clampedLat.toFixed(4)}, ${clampedLon.toFixed(4)})`);
      },
      (error) => {
        alert("Failed to retrieve live location: " + error.message);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // Submit New Event (Module 1, 2, 4 + Auto Dispatch)
  const handleSubmitNewEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let lat = newEvent.latitude;
      let lon = newEvent.longitude;
      let junc = newEvent.junction;

      // Auto-geocode if search query exists and we haven't geocoded yet or are using the default
      if (searchQuery.trim() && (!geocodedAddress || newEvent.latitude === 12.9716)) {
        try {
          const geoRes = await fetch(`${API_URL}/api/geocode?query=${encodeURIComponent(searchQuery)}`);
          if (geoRes.ok) {
            const data = await geoRes.json();
            lat = data.latitude;
            lon = data.longitude;
            junc = data.address.split(',')[0];
          }
        } catch (err) {
          console.error("Auto-geocoding on submit failed:", err);
        }
      }

      const res = await fetch(`${API_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEvent,
          event_cause: newEvent.event_cause === 'others' ? customCause : newEvent.event_cause,
          latitude: lat,
          longitude: lon,
          junction: junc
        })
      });
      if (!res.ok) throw new Error("Failed to submit event to backend.");
      const result = await res.json();
      
      // Update local state
      setEventsData(prev => ({
        events: [result.event, ...prev.events],
        total_count: prev.total_count + 1
      }));
      
      // Switch select event
      setSelectedEvent(result.event);
      setLiveTraffic(result.predictions.live_traffic);
      setImpactRadiusM(result.predictions.impact_radius_m);
      setImpactRadiusKm(result.predictions.impact_radius_km);
      setAffectedJunctions(result.predictions.affected_junctions);
      setAffectedRoads(result.predictions.affected_roads);
      setSeverityLevel(result.predictions.severity_level);
      setDiversionRoutes(result.predictions.diversion_routes);
      setGeojsonVisualizations(result.predictions.geojson_visualizations);

      // Trigger Alert modal if autonomous dispatch was triggered
      if (result.autonomous_dispatch.triggered) {
        setAutonomousAlert(result.autonomous_dispatch.order);
      }
      
      // Reset form
      setNewEvent({
        event_cause: 'vehicle_breakdown',
        event_type: 'unplanned',
        zone: 'Central Zone 2',
        junction: 'M.G. Road',
        latitude: 12.9716,
        longitude: 77.5946,
        requires_road_closure: false,
        duration: 60,
        priority: 'Low',
        description: ''
      });
      setDurationInputVal(60);
      setDurationUnit('mins');
      setGeocodedAddress('');
      setSearchQuery('');
      setCustomCause('');
      
      // Refresh memory list & metrics
      const offRes = await fetch(`${API_URL}/api/officers`);
      if (offRes.ok) setOfficers(await offRes.json());
      const dispRes = await fetch(`${API_URL}/api/dispatches`);
      if (dispRes.ok) setDispatches(await dispRes.json());
      
    } catch (err: any) {
      alert(err.message || "Error submitting event.");
    } finally {
      setSubmitting(false);
    }
  };

  // Run Manual Dispatch
  const handleManualDispatch = async () => {
    if (!selectedEvent || selectedOfficerIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/dispatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEvent.id,
          officer_ids: selectedOfficerIds,
          barricades_count: selectedEvent.barricades_count,
          diversion_route: selectedEvent.diversion_route_a,
          message: `Manual dispatch deployed to ${selectedEvent.junction}`
        })
      });
      if (!res.ok) throw new Error("Manual Dispatch failed.");
      
      alert("Manual Dispatch deployed! Officers mobilized.");
      setManualDispatchOpen(false);
      setSelectedOfficerIds([]);
      
      // Refresh
      const offRes = await fetch(`${API_URL}/api/officers`);
      if (offRes.ok) setOfficers(await offRes.json());
      const dispRes = await fetch(`${API_URL}/api/dispatches`);
      if (dispRes.ok) setDispatches(await dispRes.json());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Custom Search Query (Module 3)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSearchText.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_cause: 'others',
          event_type: 'unplanned',
          zone: 'Central Zone 2',
          junction: customSearchText,
          requires_road_closure: false,
          duration: 60,
          priority: 'Low'
        })
      });
      
      if (!res.ok) throw new Error("Search failed.");
      const data = await res.json();
      setSearchResults(data.similar_events || []);
    } catch (err: any) {
      alert(err.message || "Failed to search.");
    } finally {
      setSearching(false);
    }
  };

  // Submit Feedback Loop (Module 7, 9 + Upgrades)
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackForm.event_id) return;
    setSubmitting(true);
    try {
      let targetEvent = eventsData.events.find(ev => String(ev.id) === feedbackForm.event_id);
      if (!targetEvent && selectedEvent && String(selectedEvent.id) === feedbackForm.event_id) {
        targetEvent = selectedEvent;
      }
      if (!targetEvent) throw new Error("Target event not found.");

      const payload = {
        event_id: intValue(feedbackForm.event_id),
        predicted_impact: targetEvent.impact_score,
        recommended_officers: targetEvent.manpower_officers,
        recommended_patrols: targetEvent.manpower_patrols,
        recommended_supervisors: targetEvent.manpower_supervisors,
        recommended_barricades: targetEvent.barricades_count,
        actual_impact: floatValue(feedbackForm.actual_impact),
        actual_officers: intValue(feedbackForm.actual_officers),
        actual_barricades: intValue(feedbackForm.actual_barricades),
        actual_outcome: feedbackForm.actual_outcome,
        feedback: feedbackForm.feedback_text,
        // New features
        actual_impact_radius_m: floatValue(feedbackForm.actual_impact_radius_m),
        diversion_chosen: feedbackForm.diversion_chosen,
        response_time_mins: floatValue(feedbackForm.response_time_mins),
        success_rating: floatValue(feedbackForm.success_rating)
      };

      const res = await fetch(`${API_URL}/api/tom/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to submit feedback.");
      
      fetchInitialData();
      alert("Post-Event outcome logged in TOM. Self-learning algorithms calibrated.");
    } catch (err: any) {
      alert(err.message || "Error submitting feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTomRecord = async (recordId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/tom/${recordId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error("Failed to delete record.");
      setTomRecords(prev => prev.filter(r => r.id !== recordId));
    } catch (err: any) {
      alert(err.message || "Error deleting record.");
    }
  };

  const handleToggleOfficerStatus = async (officerId: number, currentStatus: string) => {
    // Cycle: Available -> Busy -> Dispatched -> Available
    let nextStatus = 'Available';
    if (currentStatus === 'Available') nextStatus = 'Busy';
    else if (currentStatus === 'Busy') nextStatus = 'Dispatched';
    
    try {
      const res = await fetch(`${API_URL}/api/officers/${officerId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error("Failed to update status.");
      
      // Update local state
      setOfficers(prev => prev.map(o => o.id === officerId ? { ...o, status: nextStatus } : o));
    } catch (err: any) {
      alert(err.message || "Failed to toggle status.");
    }
  };


  const intValue = (val: any) => {
    const parsed = parseInt(val);
    return isNaN(parsed) ? 0 : parsed;
  };
  const floatValue = (val: any) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0.0 : parsed;
  };

  // Helper Badge Renderers
  const renderRiskBadge = (level: string) => {
    switch (level) {
      case 'Critical':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-950/80 text-red-300 border border-red-500/30 glow-border-red">Critical</span>;
      case 'High':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/30">High</span>;
      case 'Medium':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-950/80 text-blue-300 border border-blue-500/30">Medium</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">Low</span>;
    }
  };

  const renderOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'Successful':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30"><CheckCircle size={12}/> Successful</span>;
      case 'Partially Successful':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-amber-950 text-amber-300 border border-amber-500/30"><AlertTriangle size={12}/> Partial</span>;
      case 'Failed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-950 text-red-300 border border-red-500/30"><XCircle size={12}/> Failed</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-900 text-slate-300 border border-slate-700/30">Active</span>;
    }
  };

  const renderCongestionBadge = (level: number) => {
    if (level >= 75) return <span className="text-red-400 font-bold glow-text-red">Critical ({level}%)</span>;
    if (level >= 45) return <span className="text-amber-400 font-bold">Heavy ({level}%)</span>;
    return <span className="text-emerald-400 font-bold">Free Flow ({level}%)</span>;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#070a13] text-slate-100 p-6 text-center">
        <AlertTriangle size={64} className="text-amber-500 mb-4 animate-bounce" />
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-indigo-400">Connection Error</h1>
        <p className="max-w-md text-slate-400 mb-6">{error}</p>
        <button 
          onClick={fetchInitialData}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition-all duration-200"
        >
          <RotateCw size={18} /> Reconnect to Backend
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#070a13] text-slate-100">
        <div className="relative w-20 h-20 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
          <div className="absolute inset-2 rounded-full border-4 border-cyan-500/10 border-t-cyan-400 animate-spin" style={{animationDirection: 'reverse', animationDuration: '1s'}}></div>
          <Activity className="absolute inset-0 m-auto text-indigo-400 animate-pulse" size={28} />
        </div>
        <h2 className="text-xl font-semibold tracking-wide text-indigo-300 glow-text-indigo">Initializing Command Console...</h2>
        <p className="text-xs text-slate-400 mt-2 animate-pulse-slow">Loading Sentence-BERT vectors, GIS database & OSM Live feeds...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#070a13] text-slate-100">
      
      {/* Sidebar Navigation */}
      <aside className="w-80 border-r border-slate-800/80 bg-[#06080e]/95 backdrop-blur-md flex flex-col justify-between shrink-0 p-6 z-10">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-800/60">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-md shadow-indigo-500/20">
              <Shield className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white glow-text-indigo">EventDNA AI</h1>
              <p className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold font-mono">Smart City Upgrade</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {[
              { id: 'command-center', name: 'Command Center', icon: Activity },
              { id: 'explorer', name: 'EventDNA Explorer', icon: Layers },
              { id: 'impact-radius', name: 'Impact Radius GIS', icon: MapIcon },
              { id: 'diversion-optimizer', name: 'Diversion Optimizer', icon: Navigation },
              { id: 'officer-allocation', name: 'Officer Management', icon: Users },
              { id: 'log-outcomes', name: 'Log Outcomes & Learn', icon: BookOpen },
              { id: 'tom', name: 'Traffic Operations Memory (TOM)', icon: Database },
              { id: 'zone-risk', name: 'Zone Risk Intelligence', icon: TrendingUp },
              { id: 'analytics', name: 'Post Event Analytics', icon: BarChart2 },
              { id: 'astram-simulator', name: 'Astram Feed Sim', icon: Cpu },
              { id: 'waterlogging', name: 'Waterlogging Alerts', icon: CloudRain }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setAutonomousAlert(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? 'bg-indigo-600/20 text-indigo-200 border-l-4 border-indigo-500 glow-border-indigo' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-indigo-400' : 'text-slate-400'} />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Selected Event Card Footer */}
        {selectedEvent && (
          <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0d1323]/50 mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 font-mono">Active Focus</span>
              <span className="text-[10px] text-slate-500 font-mono">#{selectedEvent.id}</span>
            </div>
            <h4 className="text-sm font-semibold text-white truncate capitalize">{selectedEvent.event_cause.replace('_', ' ')}</h4>
            <p className="text-xs text-slate-400 truncate mt-0.5">{selectedEvent.junction}</p>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
              <span className="text-xs font-semibold text-indigo-300">Impact Score: {selectedEvent.impact_score.toFixed(0)}</span>
              {renderRiskBadge(selectedEvent.risk_level)}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="scanline"></div>

        {/* Autonomous Dispatch Overlay Banner */}
        {autonomousAlert && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/70 border border-red-500/50 flex gap-4 items-start animate-pulse shadow-lg shadow-red-900/10">
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={24} />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-200 uppercase tracking-wide">AUTONOMOUS DEPLOYMENT ORDER INITIATED</h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{autonomousAlert.message}</p>
              <div className="mt-3 flex gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/50 text-red-200 border border-red-500/30 font-mono">Status: MOBILIZING</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">Diversion: Route A</span>
              </div>
            </div>
            <button 
              onClick={() => setAutonomousAlert(null)}
              className="text-slate-400 hover:text-slate-200 text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: COMMAND CENTER */}
        {activeTab === 'command-center' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Live Traffic Command Center</h2>
                <p className="text-slate-400 text-sm">Synchronized Incident Intake, Geospatial Blast Analysis, & Autonomous Dispatching</p>
              </div>
              <button 
                onClick={fetchInitialData}
                className="flex items-center gap-2 px-4 py-2 rounded-lg glass-panel hover:bg-slate-800/50 text-indigo-300 text-sm font-medium border-indigo-500/20"
              >
                <RotateCw size={14} /> Sync Platform
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { name: 'Monitored Events', value: eventsData.total_count, icon: Database, color: 'text-indigo-400' },
                { name: 'Live Congestion Index (Avg)', value: liveTraffic ? `${liveTraffic.congestion_level}%` : '42%', icon: AlertTriangle, color: 'text-amber-500' },
                { name: 'Nearest Available Units', value: officers.filter(o => o.status === 'Available').length, icon: Users, color: 'text-cyan-400' },
                { name: 'Auto-Dispatch Mobilizations', value: dispatches.length, icon: Shield, color: 'text-emerald-400' }
              ].map((m, idx) => {
                const Icon = m.icon;
                return (
                  <div key={idx} className="glass-panel p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">{m.name}</p>
                      <h3 className="text-xl font-bold mt-1 text-white">{m.value}</h3>
                    </div>
                    <div className={`p-2.5 rounded-lg bg-slate-800/60 ${m.color}`}>
                      <Icon size={18} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-6">
              
              {/* Event Creation Form with Geocoding */}
              <div className="col-span-1 glass-panel p-5 rounded-xl border-indigo-500/10 bg-[#0d1323]/40 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="text-indigo-400" size={20} />
                  <h3 className="text-base font-bold text-white">Incident Intake Portal</h3>
                </div>

                <form onSubmit={handleSubmitNewEvent} className="space-y-3">
                  {/* Location Search Geocoder (Integrated) */}
                  <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                    <label className="text-[10px] text-cyan-400 font-mono uppercase font-bold block mb-1">Incident Location / Junction</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="e.g. Majestic Bus Stand, Bangalore"
                        className="flex-1 glass-input px-2.5 py-1 text-xs rounded"
                        required
                      />
                      <button
                        type="button"
                        onClick={handleGeocodeSearch}
                        disabled={geocoding}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-xs text-white font-semibold"
                      >
                        {geocoding ? '...' : 'Search'}
                      </button>
                    </div>
                    {geocodedAddress && (
                      <p className="text-[10px] text-emerald-400 mt-1 truncate italic">✓ Resolved: {geocodedAddress}</p>
                    )}
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-900/60">
                      <span className="text-[9px] text-slate-500 font-mono">or coordinates:</span>
                      <button
                        type="button"
                        onClick={handleUseLiveLocation}
                        className="text-[9px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 hover:border-slate-700 transition-colors select-none"
                      >
                        📍 Use Live Location
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-medium block mb-1">Event Cause</label>
                    <select
                      value={newEvent.event_cause}
                      onChange={e => setNewEvent({...newEvent, event_cause: e.target.value})}
                      className="w-full glass-input px-2 py-1 text-xs rounded capitalize"
                    >
                      {causes.map(c => (
                        <option key={c} value={c} className="bg-slate-900 capitalize">{c.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>

                  {newEvent.event_cause === 'others' && (
                    <div className="mt-2 transition-all duration-200 ease-in-out">
                      <label className="text-xs text-slate-400 font-medium block mb-1">Specify Custom Event Cause</label>
                      <input
                        type="text"
                        placeholder="e.g. Marathon, Protest, VIP Convoy..."
                        value={customCause}
                        onChange={e => setCustomCause(e.target.value)}
                        className="w-full glass-input px-2 py-1 text-xs rounded border border-slate-800 focus:border-cyan-500 focus:outline-none bg-slate-950 text-slate-200"
                        required
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1">Event Type</label>
                      <select
                        value={newEvent.event_type}
                        onChange={e => setNewEvent({...newEvent, event_type: e.target.value})}
                        className="w-full glass-input px-2 py-1 text-xs rounded capitalize"
                      >
                        <option value="unplanned" className="bg-slate-900">Unplanned</option>
                        <option value="planned" className="bg-slate-900">Planned</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1">Priority</label>
                      <select
                        value={newEvent.priority}
                        onChange={e => setNewEvent({...newEvent, priority: e.target.value})}
                        className="w-full glass-input px-2 py-1 text-xs rounded"
                      >
                        <option value="Low" className="bg-slate-900">Low</option>
                        <option value="High" className="bg-slate-900">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1">Duration</label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          value={durationInputVal}
                          onChange={e => setDurationInputVal(parseInt(e.target.value) || 0)}
                          className="w-20 glass-input px-2 py-1 text-xs rounded"
                          min="1"
                        />
                        <select
                          value={durationUnit}
                          onChange={e => setDurationUnit(e.target.value as 'mins' | 'hrs')}
                          className="w-16 px-1 py-1 text-xs rounded bg-slate-950 text-slate-300 border border-slate-800 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="mins" className="bg-slate-900">Min</option>
                          <option value="hrs" className="bg-slate-900">Hrs</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-4">
                      <input
                        type="checkbox"
                        id="closure"
                        checked={newEvent.requires_road_closure}
                        onChange={e => setNewEvent({...newEvent, requires_road_closure: e.target.checked})}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600"
                      />
                      <label htmlFor="closure" className="text-xs text-slate-400 font-semibold cursor-pointer">Road Closure</label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 rounded bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-1.5"
                  >
                    {submitting ? 'Analyzing...' : <><Cpu size={14} /> Process and moblize</>}
                  </button>
                </form>
              </div>

              {/* Map & Live Stream (Visualizations integrated) */}
              <div className="col-span-2 space-y-6">
                <div className="glass-panel p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <MapIcon className="text-cyan-400" size={16} /> Live Operations Map (Bangalore Command)
                    </h3>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono cursor-pointer hover:text-cyan-400 transition-colors select-none">
                        <input
                          type="checkbox"
                          checked={showHoneycomb}
                          onChange={e => setShowHoneycomb(e.target.checked)}
                          className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-cyan-500"
                        />
                        H3 Grid Overlay
                      </label>
                      {selectedEvent && (
                        <span className="text-[10px] font-mono text-cyan-400">Centered: {selectedEvent.junction}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Map Component */}
                  {selectedEvent ? (
                    <div className="relative">
                      <LeafletMapComponent 
                        centerLat={selectedEvent.latitude}
                        centerLon={selectedEvent.longitude}
                        radiusM={impactRadiusM}
                        eventsData={eventsData.events}
                        officersData={officers}
                        diversionRoutes={diversionRoutes}
                        geojsonVisualizations={geojsonVisualizations}
                        selectedEvent={selectedEvent}
                        showHoneycomb={showHoneycomb}
                      />
                    </div>
                  ) : (
                    <div className="h-96 rounded-lg bg-slate-950 flex items-center justify-center text-slate-500">
                      Select an event to load Command Center Map view
                    </div>
                  )}
                </div>



                {/* Operations logs and feed */}
                <div className="glass-panel p-5 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-white">Mobilization Logs (Dispatches)</h3>
                    <span className="text-xs font-mono text-slate-500">History of dispatched agents</span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 text-xs">
                    {dispatches.length > 0 ? (
                      dispatches.map(d => (
                        <div key={d.id} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex justify-between items-center">
                          <div>
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold border border-slate-700 mr-2">DISP-{d.id}</span>
                            <span className="font-semibold text-slate-200 capitalize">{d.event_cause} at {d.junction}</span>
                            <p className="text-slate-400 text-[10px] mt-0.5 italic">"{d.dispatch_message}"</p>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-red-950/50 text-red-300 border border-red-500/20 text-[10px] font-mono font-semibold shrink-0 ml-4">{d.status}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 italic text-center py-4">No active dispatch orders generated yet.</p>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Event Feeds bottom row */}
            <div className="glass-panel p-5 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white">Live Operations Feed</h3>
                <span className="text-xs text-slate-400">Click to focus commander map & load copilot routes</span>
              </div>
              <div className="grid grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-2">
                {eventsData.events.slice(0, 15).map(ev => {
                  const isSelected = selectedEvent?.id === ev.id;
                  return (
                    <div
                      key={ev.id}
                      onClick={() => handleSelectEvent(ev)}
                      className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col justify-between h-28 ${
                        isSelected
                          ? 'bg-indigo-600/10 border-indigo-500/80 shadow-md'
                          : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-cyan-400 font-semibold">{ev.original_id || `EV-${String(ev.id).padStart(4, '0')}`}</span>
                            <span className="text-[9px] font-mono text-slate-500">{ev.start_datetime.substring(11, 16)}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-100 mt-1 capitalize truncate max-w-[180px]">{ev.event_cause.replace('_', ' ')} at {ev.junction}</h4>
                        </div>
                        {renderRiskBadge(ev.risk_level)}
                      </div>
                      <div className="flex justify-between items-end border-t border-slate-800/60 pt-2 mt-2">
                        <span className="text-[10px] text-slate-400 italic truncate max-w-[140px]">"{ev.generated_description}"</span>
                        <span className="text-[10px] font-bold text-indigo-300 shrink-0 font-mono">Impact: {ev.impact_score.toFixed(0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EventDNA Explorer */}
        {activeTab === 'explorer' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">EventDNA Explorer</h2>
              <p className="text-slate-400 text-sm">Natural Language Description Generator & Semantic Vector Inspector</p>
            </div>

            {selectedEvent ? (
              <div className="grid grid-cols-3 gap-6">
                
                {/* Generated Description Card */}
                <div className="col-span-2 space-y-6">
                  <div className="glass-panel p-5 rounded-xl">
                    <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 text-indigo-400">
                      <Cpu size={16} /> Module 1: Natural Language Description Generator
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                        <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-slate-400">Source Event Data:</span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Cause</span>
                            <span className="text-xs text-slate-200 capitalize font-medium">{selectedEvent.event_cause.replace('_', ' ')}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Event Type</span>
                            <span className="text-xs text-slate-200 capitalize font-medium">{selectedEvent.event_type}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Zone</span>
                            <span className="text-xs text-slate-200 font-medium">{selectedEvent.zone}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Junction</span>
                            <span className="text-xs text-slate-200 font-medium">{selectedEvent.junction}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Road Closure</span>
                            <span className="text-xs text-slate-200 font-medium">{selectedEvent.requires_road_closure === 1 ? 'Yes' : 'No'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Duration</span>
                            <span className="text-xs text-slate-200 font-medium">{selectedEvent.duration} minutes</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg bg-gradient-to-r from-indigo-900/20 to-cyan-900/10 border border-indigo-500/30">
                        <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-indigo-400">Generated EventDNA Semantic Text:</span>
                        <p className="text-sm text-slate-100 font-medium mt-1 leading-relaxed">
                          "{selectedEvent.generated_description}"
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* S-BERT Embedding Inspector */}
                  <div className="glass-panel p-5 rounded-xl">
                    <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2 text-cyan-400">
                      <Layers size={16} /> Module 2: Sentence-BERT Vector (EventDNA Embeddings)
                    </h3>
                    <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                      Below is a visual simulation of the 384-dimensional dense vector representing this event description, encoded using the pre-trained <strong>all-MiniLM-L6-v2</strong> model. This vector captures the deep semantic content and forms the unique DNA of the incident.
                    </p>

                    <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800/80">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-slate-400">Dim [0 - 383] - Float32 Array</span>
                        <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">all-MiniLM-L6-v2</span>
                      </div>
                      
                      {/* Grid representation */}
                      <div className="grid grid-cols-12 gap-1 h-32 overflow-y-auto mb-2">
                        {Array.from({length: 120}).map((_, i) => {
                          const val = Math.sin(selectedEvent.id * 1.5 + i * 2.3) * 0.25;
                          const color = val > 0 ? `rgba(99, 102, 241, ${Math.abs(val) * 3})` : `rgba(6, 182, 212, ${Math.abs(val) * 3})`;
                          return (
                            <div 
                              key={i} 
                              className="w-full aspect-square rounded-[2px]" 
                              style={{ backgroundColor: color }}
                              title={`Dim ${i}: ${val.toFixed(6)}`}
                            />
                          );
                        })}
                        <div className="col-span-12 text-center text-[10px] text-slate-500 pt-2 border-t border-slate-800 font-mono">
                          + 264 dimensions (truncated for display)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Explorer Statistics */}
                <div className="col-span-1 space-y-6">
                  <div className="glass-panel p-5 rounded-xl">
                    <h3 className="text-base font-bold text-white mb-4">Semantic Properties</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                        <span className="text-xs text-slate-400">Embedding Size</span>
                        <span className="text-xs font-mono text-slate-100 font-bold">384 Dimensions</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                        <span className="text-xs text-slate-400">Vector Format</span>
                        <span className="text-xs font-mono text-slate-100 font-bold">FP32 (L2 Normalized)</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                        <span className="text-xs text-slate-400">Index System</span>
                        <span className="text-xs font-mono text-slate-100 font-bold">FAISS IndexFlatL2</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                        <span className="text-xs text-slate-400">Cosine Similarity Bound</span>
                        <span className="text-xs font-mono text-slate-100 font-bold">0.0 to 1.0</span>
                      </div>
                    </div>

                    <div className="mt-6 p-4 rounded-lg bg-slate-900/60 border border-slate-800 border-dashed">
                      <h4 className="text-xs font-semibold text-indigo-300 mb-1.5 flex items-center gap-1.5">
                        <BookOpen size={14} /> Semantic Knowledge
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Sentence-BERT captures complex spatial relationships and event causes semantically, mapping concepts like "breakdown" to "engine failure" or "stuck truck" dynamically.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="glass-panel p-6 text-center text-slate-400 rounded-xl">
                Please select an event in the Command Center list to explore its EventDNA.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: IMPACT RADIUS VISUALIZATION */}
        {activeTab === 'impact-radius' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Traffic Impact Radius GIS Engine</h2>
              <p className="text-slate-400 text-sm">Predictive Blast Radius calculation overlaid with H3 Hexagonal indices & concentric impact buffers</p>
            </div>

            {selectedEvent ? (
              <>
                <div className="grid grid-cols-3 gap-6">
                
                {/* Left Column: GIS Map */}
                <div className="col-span-2 glass-panel p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold">Impact Radius Map Rendering</span>
                    <span className="text-xs font-mono text-slate-500">Radius: {impactRadiusM.toFixed(0)}m ({impactRadiusKm.toFixed(2)} km)</span>
                  </div>

                  <LeafletMapComponent 
                    centerLat={selectedEvent.latitude}
                    centerLon={selectedEvent.longitude}
                    radiusM={impactRadiusM}
                    eventsData={eventsData.events}
                    officersData={officers}
                    diversionRoutes={[]}
                    geojsonVisualizations={geojsonVisualizations}
                    selectedEvent={selectedEvent}
                    showHoneycomb={showHoneycomb}
                  />
                </div>

                {/* Right Column: GIS parameters */}
                <div className="col-span-1 space-y-6">
                  <div className="glass-panel p-5 rounded-xl bg-[#0d1323]/50">
                    <h3 className="text-base font-bold text-white mb-3">Impact Radius Output</h3>
                    
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-red-950/20 border border-red-500/20">
                        <span className="text-[10px] font-mono text-red-400 uppercase font-bold block">Severity Level</span>
                        <h2 className="text-2xl font-extrabold text-red-300 mt-1 glow-text-red">{severityLevel}</h2>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block">Radius (m)</span>
                          <span className="text-lg font-bold text-white font-mono">{impactRadiusM.toFixed(0)}m</span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block">Radius (km)</span>
                          <span className="text-lg font-bold text-white font-mono">{impactRadiusKm.toFixed(2)} km</span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block">Affected Junctions</span>
                          <span className="text-lg font-bold text-white font-mono">{affectedJunctions}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block">Affected Roads</span>
                          <span className="text-lg font-bold text-white font-mono">{affectedRoads}</span>
                        </div>
                      </div>

                      {liveTraffic && (
                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold block">Live Traffic State</span>
                          <div className="flex justify-between text-xs pb-1 border-b border-slate-900">
                            <span className="text-slate-400">Congestion Level:</span>
                            {renderCongestionBadge(liveTraffic.congestion_level)}
                          </div>
                          <div className="flex justify-between text-xs pb-1 border-b border-slate-900">
                            <span className="text-slate-400">Travel Time Index:</span>
                            <span className="text-white font-mono font-bold">{liveTraffic.travel_time_index}x</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Road Closure Active:</span>
                            <span className={`font-semibold ${liveTraffic.closure_status ? 'text-red-400' : 'text-emerald-400'}`}>{liveTraffic.closure_status ? 'YES' : 'NO'}</span>
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400 leading-relaxed">
                        Concentric buffers at <strong>100m, 250m, 500m, 1000m, 1500m</strong> are calculated and projected using shapely geodesics, while H3 maps hexagons covering affected areas.
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Recommended Tactical Response */}
              <div className="glass-panel p-5 rounded-xl space-y-4 mt-6">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 text-indigo-400">
                  <Cpu size={16} /> Recommended Tactical Response
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Manpower Deployment */}
                  <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-slate-400 block mb-2">Manpower Deployment</span>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between border-b border-slate-900 pb-1">
                        <span className="text-slate-500">Traffic Police Officers</span>
                        <span className="font-bold text-white font-mono">{selectedEvent.manpower_officers || 0} officers</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-900 pb-1">
                        <span className="text-slate-500">Patrol Teams (Bikes)</span>
                        <span className="font-bold text-white font-mono">{selectedEvent.manpower_patrols || 0} teams</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Supervisors</span>
                        <span className="font-bold text-white font-mono">{selectedEvent.manpower_supervisors || 0} officers</span>
                      </div>
                    </div>
                  </div>

                  {/* Barricading Strategy */}
                  <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-slate-400 block mb-2">Barricading Strategy</span>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between border-b border-slate-900 pb-1">
                        <span className="text-slate-500">Barricades Needed</span>
                        <span className="font-bold text-white font-mono">{selectedEvent.barricades_count || 0} blocks</span>
                      </div>
                      <div className="pt-1">
                        <span className="text-[10px] text-slate-500 block mb-0.5">Suggested Placement:</span>
                        <p className="text-slate-300 italic">"{selectedEvent.barricades_placement || 'Deploy warning barricades around primary event corridor.'}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </>
            ) : (
              <div className="glass-panel p-6 text-center text-slate-400 rounded-xl">
                Please select an event to run the Traffic Impact Radius Engine.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DIVERSION OPTIMIZER */}
        {activeTab === 'diversion-optimizer' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Smart Diversion Optimization Engine</h2>
              <p className="text-slate-400 text-sm">Dynamic detour routing avoiding incident zones, computed via NetworkX path searches</p>
            </div>

            {selectedEvent && diversionRoutes.length > 0 ? (
              <div className="space-y-6">
                
                {/* Diversion Details */}
                <div className="grid grid-cols-3 gap-6">
                  {diversionRoutes.map((route: any, index: number) => {
                    const colors = [
                      { bg: 'bg-indigo-950/20', border: 'border-indigo-500/20', text: 'text-indigo-400', stroke: '#6366f1', activeBorder: 'border-indigo-500 shadow-lg shadow-indigo-500/10' },
                      { bg: 'bg-cyan-950/20', border: 'border-cyan-500/20', text: 'text-cyan-400', stroke: '#06b6d4', activeBorder: 'border-cyan-500 shadow-lg shadow-cyan-500/10' },
                      { bg: 'bg-emerald-950/20', border: 'border-emerald-500/20', text: 'text-emerald-400', stroke: '#10b981', activeBorder: 'border-emerald-500 shadow-lg shadow-emerald-500/10' }
                    ];
                    const design = colors[index % colors.length];
                    const isHighlighted = highlightedRouteIndex === index;
                    
                    return (
                      <div 
                        key={index} 
                        className={`glass-panel p-5 rounded-xl border transition-all duration-200 cursor-pointer ${
                          diversionRoutes.length === 1 
                            ? 'col-span-3 border-cyan-500/30 bg-cyan-950/10 shadow-lg shadow-cyan-500/5' 
                            : isHighlighted 
                              ? design.activeBorder + ' scale-[1.02] bg-slate-900/60' 
                              : design.border + ' ' + design.bg + ' opacity-60 hover:opacity-100'
                        }`}
                        onMouseEnter={() => setHighlightedRouteIndex(index)}
                        onClick={() => setHighlightedRouteIndex(index)}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <span className={`text-[10px] font-mono ${design.text} uppercase font-bold`}>Recommended Detour Route</span>
                          <span className="text-[10px] font-mono text-slate-500">#{index+1}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-200">{route.name}</h4>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{route.description}</p>
                        
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/40">
                          <div>
                            <span className="text-[9px] text-slate-500 block">ETA</span>
                            <span className="text-sm font-bold text-white font-mono">{route.eta_mins} mins</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block">Delay Saved</span>
                            <span className="text-sm font-bold text-emerald-400 font-mono">-{route.delay_saved_mins} mins</span>
                          </div>
                          <div className="mt-2">
                            <span className="text-[9px] text-slate-500 block">Distance</span>
                            <span className="text-xs font-bold text-slate-300 font-mono">{route.distance_km} km</span>
                          </div>
                          <div className="mt-2">
                            <span className="text-[9px] text-slate-500 block">Congestion Avoided</span>
                            <span className="text-xs font-bold text-indigo-300 font-mono">{route.congestion_avoided_pct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Map Overlay & Chart */}
                <div className="grid grid-cols-3 gap-6">
                  {/* Map */}
                  <div className="col-span-2 glass-panel p-4 rounded-xl">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold block mb-3">Detour Paths map layer</span>
                    <LeafletMapComponent 
                      centerLat={selectedEvent.latitude}
                      centerLon={selectedEvent.longitude}
                      radiusM={impactRadiusM}
                      eventsData={eventsData.events}
                      officersData={officers}
                      diversionRoutes={diversionRoutes}
                      geojsonVisualizations={geojsonVisualizations}
                      selectedEvent={selectedEvent}
                      showHoneycomb={showHoneycomb}
                      highlightedRouteIndex={highlightedRouteIndex}
                      hideRadiusCircles={true}
                    />
                  </div>

                  {/* Detour stats comparison chart */}
                  <div className="col-span-1 glass-panel p-5 rounded-xl flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white mb-4">Route Performance Comparison</h3>
                      
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={diversionRoutes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={8} tickFormatter={(v) => v.replace("Diversion via ", "")} />
                            <YAxis stroke="#64748b" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                            <Legend />
                            <Bar name="ETA (Mins)" dataKey="eta_mins" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar name="Delay Saved (Mins)" dataKey="delay_saved_mins" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-[10px] text-slate-400 leading-relaxed mt-4">
                      <strong>Optimization Strategy:</strong> Traffic is actively diverted via <strong>{diversionRoutes[0]?.name.replace("Diversion via ", "")}</strong> to minimize delay, bypassing the incident bottleneck and saving <strong>{diversionRoutes[0]?.delay_saved_mins} mins</strong> of travel time.
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="glass-panel p-6 text-center text-slate-400 rounded-xl">
                Please select an event in the Command Center to run the Diversion Optimizer.
              </div>
            )}
          </div>
        )}

        {/* TAB 5: OFFICER ALLOCATION */}
        {activeTab === 'officer-allocation' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">GPS-Based Officer Management System</h2>
                <p className="text-slate-400 text-sm">Real-time coordinates of traffic officers & closest unit mobilizations via Haversine distance</p>
              </div>
              
              {selectedEvent && (
                <button
                  onClick={() => {
                    // Preselect recommended officers based on Event
                    const availOfficers = officers.filter(o => o.status === 'Available');
                    // Find nearest available
                    const nearest = [...availOfficers].map(o => {
                      const R = 6371.0;
                      const dlat = (o.latitude - selectedEvent.latitude) * Math.PI / 180;
                      const dlon = (o.longitude - selectedEvent.longitude) * Math.PI / 180;
                      const a = Math.sin(dlat/2)**2 + Math.cos(selectedEvent.latitude * Math.PI / 180) * Math.cos(o.latitude * Math.PI / 180) * Math.sin(dlon/2)**2;
                      const dist = 2 * R * Math.asin(Math.sqrt(a));
                      return { ...o, distance_km: dist };
                    }).sort((a,b) => a.distance_km - b.distance_km);
                    
                    setSelectedOfficerIds(nearest.slice(0, selectedEvent.manpower_officers).map(o => o.id));
                    setManualDispatchOpen(true);
                  }}
                  className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow"
                >
                  <Send size={12} /> Mobilize Tactical Unit
                </button>
              )}
            </div>

            {/* Manual Dispatch Modal Overlay */}
            {manualDispatchOpen && selectedEvent && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="glass-panel p-6 rounded-xl border-slate-700 bg-slate-900 w-full max-w-lg space-y-4">
                  <h3 className="text-base font-bold text-white">Mobilize officers to {selectedEvent.junction}</h3>
                  <p className="text-xs text-slate-400">Select available traffic officers to deploy. The Copilot recommends <strong>{selectedEvent.manpower_officers} officers</strong>.</p>
                  
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {officers.filter(o => o.status === 'Available').map(o => (
                      <label key={o.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-800/50 cursor-pointer border border-slate-800 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedOfficerIds.includes(o.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedOfficerIds([...selectedOfficerIds, o.id]);
                            } else {
                              setSelectedOfficerIds(selectedOfficerIds.filter(id => id !== o.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600"
                        />
                        <div className="flex-1 flex justify-between">
                          <span className="font-semibold text-slate-200">{o.officer_name}</span>
                          <span className="text-slate-400 font-mono">Sector:Indiranagar</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                    <button
                      onClick={() => setManualDispatchOpen(false)}
                      className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleManualDispatch}
                      disabled={submitting || selectedOfficerIds.length === 0}
                      className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow"
                    >
                      {submitting ? 'Deploying...' : `Mobilize ${selectedOfficerIds.length} officers`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              
              {/* Officers Table List */}
              <div className="col-span-2 glass-panel p-5 rounded-xl">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-white">Active Dispatch registry</h3>
                  <span className="text-[10px] font-mono text-slate-500">25 active personnel tracked</span>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Coordinates</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {officers.map(o => (
                        <tr key={o.id} className="hover:bg-slate-900/20">
                          <td className="px-3 py-3 font-mono">#OFF-{o.id}</td>
                          <td className="px-3 py-3 font-semibold text-white">{o.officer_name}</td>
                          <td className="px-3 py-3 font-mono text-slate-400 text-[11px]">{o.latitude.toFixed(4)}, {o.longitude.toFixed(4)}</td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => handleToggleOfficerStatus(o.id, o.status)}
                              title="Click to toggle status (Available -> Busy -> Dispatched)"
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all hover:brightness-125 hover:scale-105 active:scale-95 cursor-pointer ${
                                o.status === 'Available' 
                                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30' 
                                  : o.status === 'Busy'
                                    ? 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                                    : 'bg-cyan-950/60 text-cyan-400 border-cyan-500/30'
                              }`}
                            >
                              {o.status}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Map & Distance Details */}
              <div className="col-span-1 space-y-6">
                
                {/* Visual Location Map */}
                <div className="glass-panel p-4 rounded-xl">
                  <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold block mb-3">Officer Mobiles Tracking</span>
                  {selectedEvent ? (
                    <LeafletMapComponent 
                      centerLat={selectedEvent.latitude}
                      centerLon={selectedEvent.longitude}
                      radiusM={impactRadiusM}
                      eventsData={eventsData.events}
                      officersData={officers}
                      diversionRoutes={[]}
                      geojsonVisualizations={geojsonVisualizations}
                      selectedEvent={selectedEvent}
                      showHoneycomb={showHoneycomb}
                    />
                  ) : (
                    <div className="h-64 rounded bg-slate-950 flex items-center justify-center text-slate-600 text-xs">
                      Select event to view mobilizations
                    </div>
                  )}
                </div>

                {/* Distance calculation panel */}
                {selectedEvent && (
                  <div className="glass-panel p-4 rounded-xl space-y-3">
                    <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold block">Nearest Available Mobilizations</span>
                    
                    <div className="space-y-2">
                      {officers.filter(o => o.status === 'Available')
                        .map(o => {
                          const R = 6371.0;
                          const dlat = (o.latitude - selectedEvent.latitude) * Math.PI / 180;
                          const dlon = (o.longitude - selectedEvent.longitude) * Math.PI / 180;
                          const a = Math.sin(dlat/2)**2 + Math.cos(selectedEvent.latitude * Math.PI / 180) * Math.cos(o.latitude * Math.PI / 180) * Math.sin(dlon/2)**2;
                          const dist = 2 * R * Math.asin(Math.sqrt(a));
                          return { ...o, distance_km: dist, eta_mins: Math.max(1, Math.round((dist / 20.0) * 60)) };
                        })
                        .sort((a,b) => a.distance_km - b.distance_km)
                        .slice(0, 3)
                        .map((o, idx) => (
                          <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 text-xs flex justify-between items-center">
                            <div>
                              <span className="font-semibold text-slate-200">{o.officer_name}</span>
                              <span className="text-[10px] text-slate-500 block">Distance: {o.distance_km.toFixed(2)} km</span>
                            </div>
                            <span className="font-mono font-bold text-cyan-400">{o.eta_mins} mins</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 6: LOG OUTCOMES & LEARN */}
        {activeTab === 'log-outcomes' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Log Incident Outcomes & Learn</h2>
              <p className="text-slate-400 text-sm">Submit observed outcomes to calibrate the self-learning ML routing and resource engines.</p>
            </div>

            <div className="grid grid-cols-3 gap-6">
              
              {/* Left Column: Memory Logs List */}
              <div className="col-span-2 glass-panel p-5 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-white">TOM Incident records</h3>
                
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {tomRecords.length === 0 ? (
                    <div className="py-10 text-center text-slate-500">
                      No operations feed records found in Traffic Operations Memory.
                    </div>
                  ) : (
                    tomRecords.map((t, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-slate-800 bg-slate-900/20 text-xs">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold font-mono text-[9px] border border-slate-700">Run #{t.id}</span>
                              <span className="text-slate-500 font-mono">Event #{t.event_id}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{t.timestamp.replace('T', ' ').substring(0, 16)}</span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-200 mt-2 capitalize">{t.event_cause.replace('_', ' ')} - {t.junction}</h4>
                            <p className="text-slate-400 mt-1 italic">"{t.generated_description}"</p>
                            
                            {/* Upgraded Parameters */}
                            <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-800/40 text-[11px] text-slate-300">
                              <div>
                                <span className="text-[9px] text-slate-500 block">Detour Choice</span>
                                <span className="font-semibold text-slate-300">{t.diversion_chosen || 'Route A'}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-500 block">Impact Radius</span>
                                <span className="font-semibold text-slate-300 font-mono">{t.impact_radius_m || 250}m</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-500 block">Response Speed</span>
                                <span className="font-semibold text-cyan-400 font-mono">{t.response_time_mins || 12} mins</span>
                              </div>
                            </div>

                            <div className="mt-3 p-2.5 rounded bg-slate-950/60 border border-slate-800/40 leading-relaxed text-slate-300">
                              <span className="font-semibold text-indigo-400 block mb-0.5">Tactical Learings & Notes:</span>
                              "{t.feedback}"
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0 space-y-2 flex flex-col items-end">
                            {renderOutcomeBadge(t.actual_outcome)}
                            <div className="text-[10px] text-slate-400 font-mono space-y-0.5 mb-2">
                              <div>Pred Impact: <strong className="text-indigo-400">{t.predicted_impact.toFixed(0)}</strong></div>
                              <div>Actual Impact: <strong className="text-white">{t.actual_impact.toFixed(0)}</strong></div>
                              <div>Off Rec/Used: <strong className="text-slate-300">{t.recommended_officers}/{t.actual_officers}</strong></div>
                              <div>Success rating: <strong className="text-emerald-400 font-bold">{t.success_rating || 8}/10</strong></div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteTomRecord(t.id)}
                              className="px-2 py-0.5 bg-red-950/60 hover:bg-red-900 border border-red-800/40 hover:border-red-600 rounded text-[10px] text-red-300 flex items-center gap-1 transition-colors select-none"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Feedback loop logging Form */}
              {selectedEvent ? (
                <div className="col-span-1 glass-panel p-5 rounded-xl border-indigo-500/15 bg-[#0d1323]/50 h-fit space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5 text-indigo-400">
                    <BookOpen size={16} /> Log Incident Outcomes
                  </h3>
                  <p className="text-xs text-slate-400">
                    Submit the actual observations of the incident to calibrate future model recommendations.
                  </p>

                  <form onSubmit={handleSubmitFeedback} className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-400 font-medium block mb-1">Target Event</label>
                      <select
                        value={feedbackForm.event_id}
                        onChange={e => {
                          const ev = eventsData.events.find(x => String(x.id) === e.target.value);
                          if (ev) {
                            setFeedbackForm({
                              event_id: e.target.value,
                              actual_impact: Math.round(ev.impact_score),
                              actual_officers: ev.manpower_officers,
                              actual_barricades: ev.barricades_count,
                              actual_outcome: ev.outcome === 'Active' ? 'Successful' : ev.outcome,
                              feedback_text: ev.feedback || '',
                              actual_impact_radius_m: ev.impact_radius_m || 250,
                              diversion_chosen: ev.diversion_route_a ? 'Route A (Primary Bypass)' : 'Route B (Arterial Bypass)',
                              response_time_mins: 15,
                              success_rating: 8
                            });
                          }
                        }}
                        className="w-full glass-input px-2.5 py-1.5 rounded text-xs"
                      >
                        {eventsData.events.slice(0, 30).map(ev => (
                          <option key={ev.id} value={ev.id} className="bg-slate-900">
                            EV-{String(ev.id).padStart(4, '0')} - {ev.event_cause.replace('_', ' ')} ({ev.junction})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 font-medium block mb-1">Observed Impact</label>
                        <input
                          type="number"
                          value={feedbackForm.actual_impact}
                          onChange={e => setFeedbackForm({...feedbackForm, actual_impact: parseInt(e.target.value) || 0})}
                          className="w-full glass-input px-2.5 py-1 rounded"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 font-medium block mb-1">Actual Officers Used</label>
                        <input
                          type="number"
                          value={feedbackForm.actual_officers}
                          onChange={e => setFeedbackForm({...feedbackForm, actual_officers: parseInt(e.target.value) || 0})}
                          className="w-full glass-input px-2.5 py-1 rounded"
                          min="0"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 font-medium block mb-1">Observed Radius (m)</label>
                        <input
                          type="number"
                          value={feedbackForm.actual_impact_radius_m}
                          onChange={e => setFeedbackForm({...feedbackForm, actual_impact_radius_m: parseInt(e.target.value) || 250})}
                          className="w-full glass-input px-2.5 py-1 rounded"
                          min="50"
                          max="2000"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 font-medium block mb-1">Observed Outcome</label>
                        <select
                          value={feedbackForm.actual_outcome}
                          onChange={e => setFeedbackForm({...feedbackForm, actual_outcome: e.target.value})}
                          className="w-full glass-input px-2.5 py-1.5 rounded"
                        >
                          <option value="Successful" className="bg-slate-900">Successful</option>
                          <option value="Partially Successful" className="bg-slate-900">Partially Successful</option>
                          <option value="Failed" className="bg-slate-900">Failed</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 font-medium block mb-1">Response Time (mins)</label>
                        <input
                          type="number"
                          value={feedbackForm.response_time_mins}
                          onChange={e => setFeedbackForm({...feedbackForm, response_time_mins: parseFloat(e.target.value) || 12})}
                          className="w-full glass-input px-2.5 py-1 rounded"
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 font-medium block mb-1">Success Rating (0-10)</label>
                        <input
                          type="number"
                          value={feedbackForm.success_rating}
                          onChange={e => setFeedbackForm({...feedbackForm, success_rating: parseFloat(e.target.value) || 8})}
                          className="w-full glass-input px-2.5 py-1 rounded"
                          min="0"
                          max="10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 font-medium block mb-1">Route Chosen</label>
                      <input
                        type="text"
                        value={feedbackForm.diversion_chosen}
                        onChange={e => setFeedbackForm({...feedbackForm, diversion_chosen: e.target.value})}
                        className="w-full glass-input px-2.5 py-1 rounded"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-medium block mb-1">Learnings & Notes</label>
                      <textarea
                        value={feedbackForm.feedback_text}
                        onChange={e => setFeedbackForm({...feedbackForm, feedback_text: e.target.value})}
                        className="w-full glass-input px-2.5 py-1.5 rounded h-16 resize-none"
                        placeholder="Log note updates..."
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all duration-200 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle size={14} /> Log Outcomes & Learn
                    </button>
                  </form>
                </div>
              ) : (
                <div className="col-span-1 glass-panel p-5 rounded-xl border border-slate-800 bg-[#0d1323]/50 h-fit space-y-4 text-center py-10 flex flex-col items-center">
                  <BookOpen className="text-slate-500 mb-2" size={32} />
                  <h3 className="text-sm font-bold text-slate-300">Log Incident Outcomes</h3>
                  <p className="text-xs text-slate-400 font-light">
                    Select an active incident from the **Command Center** or **EventDNA Explorer** tab to submit actual observations and calibrate the self-learning ML dispatch engine.
                  </p>
                </div>
              )}

            </div>
          </div>
        )}

        {/* TAB 7: TRAFFIC OPERATIONS MEMORY (TOM) DATABASE */}
        {activeTab === 'tom' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Traffic Operations Memory (TOM) Database</h2>
              <p className="text-slate-400 text-sm">Comprehensive catalog of all persistent incident records in the city registry. Select, focus, or delete entries.</p>
            </div>

            {/* Filter and Search Bar */}
            <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0d1323]/50 flex flex-wrap items-center gap-4 text-xs">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Search Junction / Description</label>
                <div className="relative">
                  <input
                    type="text"
                    value={tomIncidentsSearch}
                    onChange={e => {
                      setTomIncidentsSearch(e.target.value);
                      setTomIncidentsPage(1);
                    }}
                    placeholder="Search e.g. Majestic, breakdown..."
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <Search className="absolute left-2.5 top-2 text-slate-500" size={14} />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Incident Cause</label>
                <select
                  value={tomIncidentsCause}
                  onChange={e => {
                    setTomIncidentsCause(e.target.value);
                    setTomIncidentsPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Causes</option>
                  {causes.map(c => (
                    <option key={c} value={c} className="bg-slate-950 capitalize">{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Risk Level</label>
                <select
                  value={tomIncidentsRisk}
                  onChange={e => {
                    setTomIncidentsRisk(e.target.value);
                    setTomIncidentsPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Risks</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div className="flex items-end h-full pt-4">
                <button
                  onClick={fetchTomIncidents}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 font-medium transition-colors"
                >
                  Refresh Database
                </button>
              </div>
            </div>

            {/* Incidents Database Grid/Table */}
            <div className="glass-panel p-5 rounded-xl border border-slate-800 bg-[#0d1323]/30">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      <th className="pb-3 pl-2">Event ID</th>
                      <th className="pb-3">Junction</th>
                      <th className="pb-3">Type & Cause</th>
                      <th className="pb-3">Risk Level</th>
                      <th className="pb-3">Impact</th>
                      <th className="pb-3">Closure</th>
                      <th className="pb-3">Logged Outcome</th>
                      <th className="pb-3 text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {tomIncidentsLoading ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-500">
                          <RotateCw size={20} className="animate-spin mx-auto mb-2 text-indigo-400" />
                          Querying persistent storage memory...
                        </td>
                      </tr>
                    ) : tomIncidents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-500">
                          No matching incidents found in persistent storage database.
                        </td>
                      </tr>
                    ) : (
                      tomIncidents.map(ev => {
                        const hasOutcome = tomRecords.some(r => r.event_id === ev.id) || (ev.outcome && ev.outcome !== 'Active');
                        return (
                          <tr key={ev.id} className="hover:bg-slate-900/10 transition-colors">
                            <td className="py-3.5 pl-2 font-mono text-cyan-400 font-semibold">
                              {ev.original_id || `EV-${String(ev.id).padStart(4, '0')}`}
                            </td>
                            <td className="py-3.5">
                              <div>
                                <span className="font-semibold text-slate-200">{ev.junction}</span>
                                <span className="text-[10px] text-slate-500 block font-mono">{ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</span>
                              </div>
                            </td>
                            <td className="py-3.5">
                              <div>
                                <span className="text-slate-300 capitalize">{ev.event_cause.replace('_', ' ')}</span>
                                <span className="text-[10px] text-slate-500 block capitalize">{ev.event_type} ({ev.duration}m)</span>
                              </div>
                            </td>
                            <td className="py-3.5">
                              {renderRiskBadge(ev.risk_level)}
                            </td>
                            <td className="py-3.5 font-bold font-mono text-indigo-400">
                              {ev.impact_score.toFixed(0)}
                            </td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                ev.requires_road_closure === 1
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {ev.requires_road_closure === 1 ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                hasOutcome
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {hasOutcome ? 'Outcome Logged' : 'Pending outcome'}
                              </span>
                            </td>
                            <td className="py-3.5 text-right pr-2 space-x-2 shrink-0">
                              <button
                                onClick={() => {
                                  handleSelectEvent(ev);
                                  setActiveTab('command-center');
                                }}
                                className="px-2.5 py-1 rounded bg-indigo-900/60 hover:bg-indigo-600 border border-indigo-700/50 text-indigo-100 font-semibold transition-colors"
                              >
                                Select & Focus
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(ev.id)}
                                className="px-2.5 py-1 rounded bg-red-950/40 hover:bg-red-900 border border-red-800/40 text-red-300 transition-colors"
                              >
                                ✕ Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {tomIncidentsTotal > 0 && (
                <div className="flex justify-between items-center mt-5 pt-4 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                  <div>
                    Showing <strong className="text-slate-200">{Math.min(tomIncidentsTotal, (tomIncidentsPage - 1) * 10 + 1)}</strong> to <strong className="text-slate-200">{Math.min(tomIncidentsTotal, tomIncidentsPage * 10)}</strong> of <strong className="text-slate-200">{tomIncidentsTotal}</strong> incidents
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTomIncidentsPage(prev => Math.max(1, prev - 1))}
                      disabled={tomIncidentsPage === 1}
                      className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors"
                    >
                      ← Previous
                    </button>
                    <span className="text-slate-300">Page {tomIncidentsPage} of {Math.ceil(tomIncidentsTotal / 10)}</span>
                    <button
                      onClick={() => setTomIncidentsPage(prev => Math.min(Math.ceil(tomIncidentsTotal / 10), prev + 1))}
                      disabled={tomIncidentsPage >= Math.ceil(tomIncidentsTotal / 10)}
                      className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 8: ZONE RISK INTELLIGENCE */}
        {activeTab === 'zone-risk' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Zone Risk Intelligence</h2>
              <p className="text-slate-400 text-sm">Zone Risk Scores today, weekly, and monthly based on historical event frequency</p>
            </div>

            <div className="space-y-6">
              {/* Historical Density Map (full width) */}
              <div className="glass-panel p-5 rounded-xl">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">Historical Density Map</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      A visual grid approximation of density of historical events across Bangalore sectors.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 leading-relaxed max-w-xs">
                    <strong>Density mapping:</strong> Circles indicate zone centers. Color intensity and size correlate with risk levels. Red is critical threat level.
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden relative">
                  <LeafletMapComponent 
                    centerLat={12.9716}
                    centerLon={77.5946}
                    radiusM={0}
                    eventsData={[]}
                    officersData={[]}
                    diversionRoutes={[]}
                    geojsonVisualizations={null}
                    selectedEvent={null}
                    showHoneycomb={false}
                    showZoneRisk={true}
                  />
                </div>
              </div>

              {/* City Risk Scores Table (full width) */}
              <div className="glass-panel p-5 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-white">City Risk Scores</h3>
                  <span className="text-[10px] font-mono text-slate-500">Real-time threat level analysis</span>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-3">Zone</th>
                        <th className="px-3 py-3 text-center">Historical Events</th>
                        <th className="px-3 py-3 text-center">Risk Score (0-100)</th>
                        <th className="px-3 py-3 text-center">Today Forecast</th>
                        <th className="px-3 py-3 text-center">Weekly Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {[
                        { name: 'Central Zone 1', events: 269, risk: 67, forecast: 71, trend: 'Rising' },
                        { name: 'Central Zone 2', events: 625, risk: 67, forecast: 63, trend: 'Stable' },
                        { name: 'East Zone 1', events: 253, risk: 64, forecast: 63, trend: 'Stable' },
                        { name: 'East Zone 2', events: 190, risk: 56, forecast: 57, trend: 'Stable' },
                        { name: 'North Zone 1', events: 318, risk: 72, forecast: 69, trend: 'Stable' },
                        { name: 'North Zone 2', events: 413, risk: 68, forecast: 67, trend: 'Stable' },
                        { name: 'South Zone 1', events: 233, risk: 55, forecast: 57, trend: 'Rising' },
                        { name: 'South Zone 2', events: 354, risk: 68, forecast: 67, trend: 'Stable' },
                        { name: 'West Zone 1', events: 433, risk: 67, forecast: 66, trend: 'Stable' },
                        { name: 'West Zone 2', events: 359, risk: 66, forecast: 70, trend: 'Rising' }
                      ].map((zone, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/20">
                          <td className="px-3 py-3.5 font-semibold text-white">{zone.name}</td>
                          <td className="px-3 py-3.5 text-center font-mono text-slate-300">{zone.events}</td>
                          <td className={`px-3 py-3.5 text-center font-bold font-mono ${
                            zone.risk >= 70 ? 'text-red-400' : zone.risk >= 60 ? 'text-amber-500' : 'text-emerald-400'
                          }`}>{zone.risk}</td>
                          <td className="px-3 py-3.5 text-center font-mono text-slate-300">{zone.forecast}</td>
                          <td className="px-3 py-3.5 text-center">
                            <span className={`inline-flex items-center gap-1 font-semibold ${
                              zone.trend === 'Rising' ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {zone.trend === 'Rising' ? '↗ Rising' : 'Stable'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: POST EVENT ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Post Event Self-Learning Analytics</h2>
              <p className="text-slate-400 text-sm">Aggregated calibration stats of forecast accuracy, resource optimization indices, and detour success rates</p>
            </div>

            {metrics && (
              <div className="space-y-6">
                
                {/* Aggregated Stat Cards */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="glass-panel p-5 rounded-xl border border-indigo-500/20 bg-indigo-950/10">
                    <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold block">Forecast Accuracy</span>
                    <h1 className="text-3xl font-extrabold text-white mt-1.5">{metrics.overall.avg_impact_accuracy.toFixed(1)}%</h1>
                    <p className="text-[11px] text-slate-400 mt-2">Combined average matching predicted impact scores and GIS blast radius calculations</p>
                  </div>
                  
                  <div className="glass-panel p-5 rounded-xl border border-cyan-500/20 bg-cyan-950/10">
                    <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold block">Dispatch Efficiency</span>
                    <h1 className="text-3xl font-extrabold text-white mt-1.5">{metrics.overall.avg_resource_accuracy.toFixed(1)}%</h1>
                    <p className="text-[11px] text-slate-400 mt-2">Accuracy index matching recommended manpower and barricades against actual fields deployed</p>
                  </div>
                  
                  <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 bg-emerald-950/10">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold block">Diversion success rate</span>
                    <h1 className="text-3xl font-extrabold text-white mt-1.5">{metrics.overall.avg_diversion_success_rate.toFixed(1)}%</h1>
                    <p className="text-[11px] text-slate-400 mt-2">Percentage score evaluating chosen bypass detours against successful restorations</p>
                  </div>
                </div>

                {/* Self learning charts */}
                <div className="glass-panel p-5 rounded-xl">
                  <h3 className="text-sm font-bold text-white mb-4">Accuracy Evolution curve (Post-Event Self Learning Epochs)</h3>
                  
                  <div className="h-72 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metrics.history.slice(-30)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorResource" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorDiv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="run" stroke="#64748b" fontSize={10} />
                        <YAxis domain={[50, 100]} stroke="#64748b" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                        <Legend />
                        <Area name="Forecast Accuracy (%)" type="monotone" dataKey="impact_accuracy" stroke="#6366f1" fillOpacity={1} fill="url(#colorForecast)" />
                        <Area name="Resource Dispatch Accuracy (%)" type="monotone" dataKey="resource_accuracy" stroke="#06b6d4" fillOpacity={1} fill="url(#colorResource)" />
                        <Area name="Diversion Success Rate (%)" type="monotone" dataKey="diversion_success" stroke="#10b981" fillOpacity={1} fill="url(#colorDiv)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* TAB 8: ASTRAM FEED SIMULATOR */}
        {activeTab === 'astram-simulator' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Astram Real-Time Stream Simulator</h2>
                <p className="text-slate-400 text-sm">Simulate active telemetry ingestion from the Astram feed and observe the automated EventDNA AI operation pipeline in real time.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  isStreaming 
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-slate-900 text-slate-400 border border-slate-700/50'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {isStreaming ? 'STREAM ACTIVE' : 'STREAM STOPPED'}
                </span>
              </div>
            </div>

            {/* Simulation Control Console */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 glass-panel p-6 rounded-xl space-y-6 border border-indigo-500/10">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsStreaming(!isStreaming)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold shadow-lg transition-all duration-200 ${
                        isStreaming
                          ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                      }`}
                    >
                      {isStreaming ? <Pause size={18} /> : <Play size={18} />}
                      {isStreaming ? 'Pause Feed Stream' : 'Connect Astram Stream'}
                    </button>
                    
                    <button
                      onClick={simulateStep}
                      disabled={isStreaming}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-200 transition-all duration-200 disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:text-slate-300"
                    >
                      <RotateCw size={18} className={simulationStatus !== 'idle' && simulationStatus !== 'completed' ? 'animate-spin' : ''} />
                      Simulate Single Event
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Stream Interval:</span>
                      <select
                        value={streamSpeed}
                        onChange={(e) => setStreamSpeed(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      >
                        <option value={3000}>3 Seconds</option>
                        <option value={5000}>5 Seconds</option>
                        <option value={8000}>8 Seconds</option>
                        <option value={12000}>12 Seconds</option>
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        setStreamLogs([]);
                        setStreamedEvents([]);
                        setStreamStats({ totalProcessed: 0, autoDispatches: 0, totalImpactScore: 0 });
                        setCurrentStepEvent(null);
                        setSimulationStatus('idle');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Reset Session
                    </button>
                  </div>
                </div>

                {/* Session Stats Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-lg">
                    <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">Events Ingested</span>
                    <div className="text-2xl font-extrabold text-white mt-1">{streamStats.totalProcessed}</div>
                    <span className="text-[9px] text-slate-400 block mt-0.5">Persisted to events database</span>
                  </div>
                  
                  <div className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-lg">
                    <span className="text-[10px] text-amber-500 font-mono uppercase font-bold">Auto Dispatches</span>
                    <div className="text-2xl font-extrabold text-amber-400 mt-1">{streamStats.autoDispatches}</div>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      Trigger rate: {streamStats.totalProcessed > 0 ? ((streamStats.autoDispatches / streamStats.totalProcessed) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  
                  <div className="bg-[#0b0f19] border border-slate-800/80 p-4 rounded-lg">
                    <span className="text-[10px] text-indigo-400 font-mono uppercase font-bold">Avg Impact Score</span>
                    <div className="text-2xl font-extrabold text-indigo-300 mt-1">
                      {streamStats.totalProcessed > 0 ? (streamStats.totalImpactScore / streamStats.totalProcessed).toFixed(1) : '0.0'}
                    </div>
                    <span className="text-[9px] text-slate-400 block mt-0.5">Fused live congestion factor</span>
                  </div>
                </div>
              </div>

              {/* Status Display Panel */}
              <div className="glass-panel p-5 rounded-xl border border-indigo-500/10 space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Stream Telemetry Status</h3>
                
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-500">Pipeline Engine:</span>
                    <span className="text-cyan-400">EventDNA AI v2.0</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-500">Inbound Feed:</span>
                    <span className="text-slate-300">Astram CSV API</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                    <span className="text-slate-500">SQLite DB state:</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Syncing
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Auto threshold:</span>
                    <span className="text-amber-500 font-semibold">&gt; 50.0 Impact</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Split Screen Log and Pipeline Visualizer */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Monospace Terminal Logs */}
              <div className="lg:col-span-5 bg-[#04060b] border border-slate-800/80 rounded-xl p-5 flex flex-col h-[520px]">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider ml-1">astram-telemetry-logs.sh</span>
                  </div>
                  <Wifi size={14} className={isStreaming ? "text-emerald-400 animate-pulse" : "text-slate-600"} />
                </div>
                
                {/* Console Log Feed */}
                <div className="flex-1 overflow-y-auto space-y-2.5 font-mono text-xs pr-2 select-text custom-scrollbar">
                  {streamLogs.length === 0 ? (
                    <div className="text-slate-600 italic flex flex-col items-center justify-center h-full gap-2">
                      <Cpu className="text-slate-800 animate-pulse" size={40} />
                      <p>Awaiting stream activation. Connect the Astram stream to begin polling real-time events.</p>
                    </div>
                  ) : (
                    streamLogs.map((log) => {
                      let colorClass = 'text-slate-300';
                      if (log.type === 'success') colorClass = 'text-emerald-400 font-medium';
                      else if (log.type === 'warn') colorClass = 'text-amber-400 font-semibold';
                      else if (log.type === 'error') colorClass = 'text-red-400 font-bold';
                      else if (log.type === 'step') colorClass = 'text-indigo-300 border-l-2 border-indigo-500 pl-2 py-0.5 font-bold';
                      
                      return (
                        <div key={log.id} className="flex gap-2.5 items-start leading-relaxed hover:bg-slate-900/30 p-1 rounded transition-colors">
                          <span className="text-slate-600 select-none shrink-0">[{log.time}]</span>
                          <span className={colorClass}>{log.message}</span>
                        </div>
                      );
                    })
                  )}
                  {isStreaming && (
                    <div className="flex gap-2 items-center text-cyan-400 font-bold animate-pulse py-1">
                      <span>dna-feed@ops-control:~$</span>
                      <span className="w-2 h-4 bg-cyan-400"></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Execution Pipeline Visualizer */}
              <div className="lg:col-span-7 bg-[#0b0f19]/80 border border-slate-800/80 rounded-xl p-6 flex flex-col h-[520px]">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-800/40">Active Pipeline Execution</h3>
                
                {!currentStepEvent ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="p-4 rounded-full bg-slate-900/80 border border-slate-800 animate-pulse">
                      <Server size={36} className="text-indigo-400/60" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-300">Telemetry Visualizer Idle</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">When the Astram telemetry feed is running, the real-time AI generation, prediction, and dispatch sequence will render here step-by-step.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                    
                    {/* Pipeline Stage Indicators */}
                    <div className="grid grid-cols-4 gap-2 mb-6">
                      {[
                        { key: 'fetching', label: '1. Ingestion', activeColor: 'bg-indigo-500 border-indigo-400 text-indigo-100' },
                        { key: 'synthesizing', label: '2. Synthesis', activeColor: 'bg-cyan-500 border-cyan-400 text-cyan-100' },
                        { key: 'predicting', label: '3. ML Prediction', activeColor: 'bg-blue-500 border-blue-400 text-blue-100' },
                        { key: 'dispatching', label: '4. Automation', activeColor: 'bg-amber-500 border-amber-400 text-amber-100' }
                      ].map((stage) => {
                        const isStageActive = simulationStatus === stage.key;
                        const isStageDone = 
                          (stage.key === 'fetching' && ['synthesizing', 'predicting', 'dispatching', 'completed'].includes(simulationStatus)) ||
                          (stage.key === 'synthesizing' && ['predicting', 'dispatching', 'completed'].includes(simulationStatus)) ||
                          (stage.key === 'predicting' && ['dispatching', 'completed'].includes(simulationStatus)) ||
                          (stage.key === 'dispatching' && simulationStatus === 'completed');
                        
                        return (
                          <div 
                            key={stage.key} 
                            className={`text-center py-2 px-1 rounded border text-[10px] font-bold uppercase transition-all duration-300 ${
                              isStageActive 
                                ? `${stage.activeColor} shadow-md` 
                                : isStageDone
                                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                                : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                            }`}
                          >
                            {stage.label}
                          </div>
                        );
                      })}
                    </div>

                    {/* Step Content Card */}
                    <div className="flex-1 bg-[#05080f] rounded-lg border border-slate-800/80 p-5 space-y-4">
                      
                      {/* Step 1 details: Ingest */}
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] text-slate-500 font-mono">STEP 1: RAW INGEST PACKET</span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-indigo-400 font-mono">ID: {currentStepEvent.id}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-2 bg-[#090d16] p-3 rounded border border-slate-850">
                          <div className="text-xs">
                            <span className="text-slate-500 block">Junction & Cause:</span>
                            <span className="text-white font-medium capitalize">{currentStepEvent.event_cause.replace('_', ' ')} at {currentStepEvent.junction}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500 block">Duration & Priority:</span>
                            <span className="text-white font-medium">{currentStepEvent.duration.toFixed(0)} mins | {currentStepEvent.priority}</span>
                          </div>
                        </div>
                      </div>

                      {/* Step 2 details: Synthesis */}
                      {['synthesizing', 'predicting', 'dispatching', 'completed'].includes(simulationStatus) && (
                        <div className="animate-fade-in border-t border-slate-800/60 pt-3">
                          <span className="text-[10px] text-slate-500 font-mono block">STEP 2: EVENTDNA DESCRIPTION SYNTHESIS (S-BERT)</span>
                          <div className="text-xs text-cyan-300 italic mt-1.5 bg-cyan-950/10 p-2.5 rounded border border-cyan-500/10 leading-relaxed">
                            "{generateDescriptionFromParams(
                              currentStepEvent.event_cause,
                              currentStepEvent.event_type,
                              currentStepEvent.zone,
                              currentStepEvent.junction,
                              currentStepEvent.requires_road_closure,
                              currentStepEvent.duration
                            )}"
                          </div>
                          {/* Mini Vector Visualizer */}
                          <div className="flex gap-0.5 mt-2 overflow-hidden h-3 rounded bg-slate-900 border border-slate-800">
                            {Array.from({ length: 48 }).map((_, idx) => {
                              const val = Math.sin(idx + currentStepEvent.id.charCodeAt(0));
                              const color = val > 0.5 ? 'bg-indigo-500' : val > 0 ? 'bg-cyan-500' : val > -0.5 ? 'bg-blue-500' : 'bg-slate-700';
                              return <div key={idx} className={`flex-1 h-full ${color}`} style={{ opacity: Math.abs(val) }} />;
                            })}
                          </div>
                          <span className="text-[8px] text-slate-500 font-mono block mt-1">384-dimensional Sentence-BERT Vector Embedding</span>
                        </div>
                      )}

                      {/* Step 3 & 4 details: ML & Dispatch */}
                      {['predicting', 'dispatching', 'completed'].includes(simulationStatus) && streamedEvents[0] && (
                        <div className="animate-fade-in border-t border-slate-800/60 pt-3 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono">STEP 3: MULTI-MODAL PREDICTION & ROUTING FUSION</span>
                            {renderRiskBadge(streamedEvents[0].predictions.risk_level)}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#090d16] p-2.5 rounded border border-slate-850 text-xs">
                              <span className="text-slate-500 block">Fused Impact Score:</span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-base font-bold text-white">{streamedEvents[0].predictions.predicted_impact}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div className="h-full bg-indigo-500" style={{ width: `${streamedEvents[0].predictions.predicted_impact}%` }} />
                                </div>
                              </div>
                            </div>
                            
                            <div className="bg-[#090d16] p-2.5 rounded border border-slate-850 text-xs">
                              <span className="text-slate-500 block">GIS Blast Radius:</span>
                              <span className="text-white font-bold block mt-1">{streamedEvents[0].predictions.impact_radius_m.toFixed(0)} meters</span>
                            </div>
                          </div>

                          {/* Step 4 details: Auto-Dispatch */}
                          {['dispatching', 'completed'].includes(simulationStatus) && (
                            <div className="animate-fade-in border-t border-slate-850 pt-3">
                              <span className="text-[10px] text-slate-500 font-mono block">STEP 4: AUTONOMOUS ACTION ENGINE</span>
                              
                              {streamedEvents[0].autonomous_dispatch.triggered ? (
                                <div className="mt-2 bg-amber-950/20 border border-amber-500/30 p-3 rounded space-y-2">
                                  <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                                    <AlertCircle size={14} className="animate-pulse" />
                                    <span>Autonomous Dispatch Order Issued</span>
                                  </div>
                                  <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
                                    {streamedEvents[0].autonomous_dispatch.order.message}
                                  </p>
                                  <div className="flex justify-between text-[9px] text-slate-400 font-mono pt-1 border-t border-slate-800/40">
                                    <span>Status: MOBILIZED</span>
                                    <span>Units: {streamedEvents[0].autonomous_dispatch.order.officer_names}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 bg-slate-900/60 border border-slate-800 p-2.5 rounded text-xs text-slate-400">
                                  Impact rating is within acceptable baseline parameter limit. Continuous GIS observation active. No emergency dispatch order required.
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      )}

                    </div>

                    {/* Footer completion indicator */}
                    {simulationStatus === 'completed' && (
                      <div className="mt-3 flex items-center justify-between text-xs text-emerald-400 font-semibold bg-emerald-950/30 border border-emerald-500/20 px-3.5 py-2.5 rounded-lg">
                        <span className="flex items-center gap-2">
                          <CheckCircle size={16} />
                          <span>Event state fully synced & logged to SQLite Database</span>
                        </span>
                        <span className="text-[10px] font-mono opacity-80">Sync Complete</span>
                      </div>
                    )}

                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {activeTab === 'waterlogging' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white glow-text-indigo">Underpass Waterlogging Predictor</h2>
                <p className="text-slate-400 text-sm font-light">
                  Machine learning predictions for waterlogging based on telemetry & real-time weather alerts.
                </p>
              </div>
              <button 
                onClick={runWaterloggingPrediction}
                disabled={predictingWaterlogging}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-600/25"
              >
                <RotateCw size={14} className={predictingWaterlogging ? "animate-spin" : ""} />
                {predictingWaterlogging ? "Analyzing Weather..." : "Run Prediction"}
              </button>
            </div>

            {/* Config & Simulation Panel */}
            <div className="grid grid-cols-3 gap-6">
              <div className="glass-panel p-5 rounded-xl border border-slate-800 bg-[#0d1323]/40 col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Google Maps API Integration</h3>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      Active & Secured
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    The Google Maps API key is centrally loaded from environment variables on the backend. This key is securely used server-side for both the Elevation API (low-lying underpass analysis) and the Directions API (diversion rerouting engine).
                  </p>
                </div>
                <div className="text-[10px] text-slate-500 mt-4 flex items-center gap-2 border-t border-slate-800/60 pt-3">
                  <Shield size={12} className="text-cyan-400" />
                  <span>Server-side key management prevents key exposure to the client.</span>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-xl border border-slate-800 bg-[#0d1323]/40 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Monsoon Simulation</h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Trigger a heavy rain telemetry stream (35mm-75mm) to validate AI waterlogging alerts and officer deployments.
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={simulateHeavyRain}
                      onChange={(e) => setSimulateHeavyRain(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-indigo-200"></div>
                    <span className="text-xs font-semibold text-slate-300">Simulate Heavy Rainfall</span>
                  </label>
                </div>
                <div className="text-[10px] text-indigo-400/80 font-mono mt-3">
                  Status: {simulateHeavyRain ? "Monsoon Mode Active" : "Real-time Telemetry Mode"}
                </div>
              </div>
            </div>

            {/* Quick Summary Metrics */}
            {waterloggingData && (
              <div className="grid grid-cols-4 gap-4">
                <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-slate-800/85">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Total Underpasses</p>
                    <h3 className="text-xl font-bold mt-1 text-white">{waterloggingData.predictions?.length || 0}</h3>
                  </div>
                  <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Database size={18} />
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-slate-800/85">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Active High Risk Alerts</p>
                    <h3 className="text-xl font-bold mt-1 text-red-400">{waterloggingData.alerts_triggered || 0}</h3>
                  </div>
                  <div className="p-2.5 rounded-lg bg-red-500/10 text-red-400">
                    <AlertCircle size={18} className="animate-pulse" />
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-slate-800/85">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Deployed High-Alert Officers</p>
                    <h3 className="text-xl font-bold mt-1 text-amber-400">
                      {officers.filter(o => o.status === 'HighAlert').length}
                    </h3>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <Users size={18} />
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl flex items-center justify-between border-slate-800/85">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">API Weather Source</p>
                    <h3 className="text-xs font-semibold mt-1 text-emerald-400 truncate max-w-[150px]">
                      {waterloggingData.predictions?.[0]?.weather?.source || "Open-Meteo"}
                    </h3>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Server size={18} />
                  </div>
                </div>
              </div>
            )}

            {/* Main predictions grid */}
            <div className="glass-panel p-6 rounded-xl border border-slate-800 bg-[#0d1323]/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-bold text-white tracking-wide">AI Predictive Waterlogging Grid</h3>
                <span className="text-xs text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full font-mono">
                  Updated: {waterloggingData ? new Date(waterloggingData.timestamp).toLocaleTimeString() : 'Never'}
                </span>
              </div>

              {!waterloggingData ? (
                <div className="py-16 text-center">
                  <CloudRain className="mx-auto text-slate-600 animate-bounce mb-3" size={40} />
                  <p className="text-sm text-slate-400 font-medium">No weather predictions run yet.</p>
                  <button 
                    onClick={runWaterloggingPrediction}
                    className="mt-4 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-bold rounded-lg border border-indigo-500/20"
                  >
                    Fetch Weather & Predict
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {waterloggingData.predictions.map((up: any) => (
                    <div 
                      key={up.underpass_id} 
                      className={`p-4 rounded-xl border transition-all duration-200 ${
                        up.prediction.is_flooded === 1 
                          ? "bg-red-950/20 border-red-500/30 shadow-md shadow-red-950/20" 
                          : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white tracking-wide">{up.location_name}</h4>
                            <span className="text-[10px] text-slate-400 font-mono">({up.underpass_id})</span>
                          </div>
                          <p className="text-xs text-slate-500 font-semibold uppercase mt-0.5 tracking-wider">{up.bbmp_zone} Zone</p>
                        </div>
                        
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          up.prediction.is_flooded === 1 
                            ? "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse" 
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}>
                          {up.prediction.is_flooded === 1 ? "RED ALERT" : "SAFE / GREEN"}
                        </span>
                      </div>

                      {/* Details row */}
                      <div className="grid grid-cols-3 gap-2 mt-4 py-2 border-t border-b border-slate-800/60 text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px]">3hr Rain</span>
                          <span className="font-mono text-slate-300 font-semibold">{up.weather.rainfall_3hr_mm} mm</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Peak Intensity</span>
                          <span className="font-mono text-slate-300 font-semibold">{up.weather.peak_intensity_mm_hr} mm/h</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Drains</span>
                          <span className={`font-semibold ${up.drain_blockage_flag === 1 ? "text-amber-400" : "text-emerald-400"}`}>
                            {up.drain_blockage_flag === 1 ? "Blocked ⚠️" : "Clear ✓"}
                          </span>
                        </div>
                      </div>

                      {/* Elevation & Geocoding Verification */}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 font-mono">
                          <MapPin size={12} className="text-indigo-400" />
                          <span>{up.latitude.toFixed(4)}, {up.longitude.toFixed(4)}</span>
                        </span>
                        {up.weather.elevation_m && (
                          <span className="text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded font-mono">
                            Elevation: {up.weather.elevation_m}m
                          </span>
                        )}
                      </div>

                      {/* Assigned officers block */}
                      {up.prediction.is_flooded === 1 && (
                        <div className="mt-4 p-3 bg-red-950/30 border border-red-500/20 rounded-lg">
                          <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold mb-2">
                            <Shield size={14} className="text-red-400" />
                            <span>Officers Assigned on High Alert:</span>
                          </div>
                          
                          {up.response.assigned_officers && up.response.assigned_officers.length > 0 ? (
                            <div className="space-y-1.5">
                              {up.response.assigned_officers.map((o: any) => (
                                <div key={o.id} className="flex justify-between items-center text-xs text-slate-300">
                                  <span>👮 {o.name}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {o.distance_km} km ({o.eta_mins}m ETA)
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No available officers near coordinates. Searching...</span>
                          )}

                          <p className="text-[10px] text-slate-400 mt-2 font-mono border-t border-red-500/10 pt-2 leading-relaxed">
                            {up.response.message}
                          </p>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// Separate Map Loader and Rendering Component to ensure Leaflet only runs client-side
function LeafletMapComponent({ centerLat, centerLon, radiusM, eventsData, officersData, diversionRoutes, geojsonVisualizations, selectedEvent, showHoneycomb, highlightedRouteIndex, hideRadiusCircles, showZoneRisk }: any) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [L, setL] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('leaflet').then((module) => {
        setL(module.default || module);
      });
    }
  }, []);

  useEffect(() => {
    if (!L || !mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
    }

    // Bangalore Bounding Box limits
    const bangaloreBounds = L.latLngBounds(
      L.latLng(12.80, 77.30),
      L.latLng(13.15, 77.85)
    );

    // Clamp center coordinates to Bangalore bounds to prevent starting outside the map viewport
    const clampedLat = Math.min(13.15, Math.max(12.80, centerLat));
    const clampedLon = Math.min(77.85, Math.max(77.30, centerLon));

    // dark theme map style with strict boundaries
    const map = L.map(mapContainerRef.current, {
      center: [clampedLat, clampedLon],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18,
      maxBounds: bangaloreBounds,
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(map);

    mapRef.current = map;

    if (showZoneRisk) {
      const zoneData = [
        { name: 'Central Zone 1', coords: [12.9716, 77.5946], risk: 67, events: 269, forecast: 71, trend: 'Rising' },
        { name: 'Central Zone 2', coords: [12.9600, 77.5800], risk: 67, events: 625, forecast: 63, trend: 'Stable' },
        { name: 'East Zone 1', coords: [12.9780, 77.6400], risk: 64, events: 253, forecast: 63, trend: 'Stable' },
        { name: 'East Zone 2', coords: [12.9900, 77.6800], risk: 56, events: 190, forecast: 57, trend: 'Stable' },
        { name: 'North Zone 1', coords: [13.0300, 77.5900], risk: 72, events: 318, forecast: 69, trend: 'Stable' },
        { name: 'North Zone 2', coords: [13.0100, 77.5500], risk: 68, events: 413, forecast: 67, trend: 'Stable' },
        { name: 'South Zone 1', coords: [12.9200, 77.5900], risk: 55, events: 233, forecast: 57, trend: 'Rising' },
        { name: 'South Zone 2', coords: [12.9100, 77.6300], risk: 68, events: 354, forecast: 67, trend: 'Stable' },
        { name: 'West Zone 1', coords: [12.9700, 77.5300], risk: 67, events: 433, forecast: 66, trend: 'Stable' },
        { name: 'West Zone 2', coords: [12.9500, 77.5000], risk: 66, events: 359, forecast: 70, trend: 'Rising' }
      ];

      zoneData.forEach(zone => {
        const color = zone.risk >= 70 ? '#ef4444' : zone.risk >= 60 ? '#f97316' : '#22c55e';
        
        L.circle(zone.coords, {
          radius: 1200,
          color: color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.25
        }).addTo(map).bindPopup(`
          <div style="font-family: sans-serif; color: #1e293b; font-size: 11px;">
            <b style="font-size: 13px; color: #0f172a;">${zone.name}</b><br/>
            <hr style="margin: 4px 0; border: 0; border-top: 1px solid #e2e8f0;"/>
            Risk Score: <b>${zone.risk}</b><br/>
            Today Forecast: <b>${zone.forecast}</b><br/>
            Historical Events: <b>${zone.events}</b><br/>
            Trend: <span style="color: ${zone.trend === 'Rising' ? '#ef4444' : '#16a34a'}; font-weight: bold;">${zone.trend}</span>
          </div>
        `);

        const labelIcon = L.divIcon({
          className: 'zone-map-label',
          html: `<div style="background-color:rgba(15,23,42,0.85); border:1px solid ${color}; border-radius:4px; padding:2px 6px; color:white; font-size:9px; font-weight:bold; font-family:sans-serif; white-space:nowrap; text-align:center; transform:translate(-50%, -50%)">${zone.name.replace(' Zone', '')}: ${zone.risk}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });
        L.marker(zone.coords, { icon: labelIcon }).addTo(map);
      });

      const group = L.featureGroup(zoneData.map(z => L.marker(z.coords)));
      map.fitBounds(group.getBounds().pad(0.1));

      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    }

    // 1. Concentric and predicted circles (hidden in diversion optimizer tab)
    if (!hideRadiusCircles) {
      const concentricColors = ['#10b981', '#3b82f6', '#f59e0b', '#7c3aed'];
      const concentricRadii = [100, 250, 500, 1000, 1500];
      
      concentricRadii.forEach((r, idx) => {
        L.circle([centerLat, centerLon], {
          radius: r,
          color: concentricColors[idx % concentricColors.length],
          weight: 1,
          fillColor: concentricColors[idx % concentricColors.length],
          fillOpacity: 0.012,
          dashArray: '3, 5'
        }).addTo(map);
      });

      // Actual predicted radius circle in red
      L.circle([centerLat, centerLon], {
        radius: radiusM,
        color: '#ef4444',
        weight: 1.5,
        fillColor: '#ef4444',
        fillOpacity: 0.06
      }).addTo(map).bindPopup(`Predicted Impact Radius: ${radiusM.toFixed(0)}m`);
    }

    // 2. Draw exact road highlight (thick bright red line for maximum visibility)
    if (geojsonVisualizations?.incident_road) {
      L.geoJSON(geojsonVisualizations.incident_road, {
        style: {
          color: '#ef4444',
          weight: 7,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round'
        }
      }).addTo(map).bindPopup(`<b>Incident Road Segment Highlighted</b><br/>Closed/obstructed corridor`);
    }

    // 3. Draw H3 Hexagons if available and toggled on (with subtle, attractive styling)
    if (showHoneycomb && geojsonVisualizations?.h3_hexagons) {
      L.geoJSON(geojsonVisualizations.h3_hexagons, {
        style: {
          color: '#475569',
          weight: 0.5,
          fillColor: '#1e293b',
          fillOpacity: 0.02
        }
      }).addTo(map);
    }

    // 4. Deployed Officers
    officersData.forEach((off: any) => {
      const isBusy = off.status === 'Dispatched' || off.status === 'Busy';
      const color = isBusy ? '#f59e0b' : '#10b981';
      
      const offIcon = L.divIcon({
        className: 'custom-officer-icon',
        html: `<div style="width:10px;height:10px;border-radius:50%;background-color:${color};border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.6)"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });

      L.marker([off.latitude, off.longitude], { icon: offIcon }).addTo(map)
        .bindPopup(`<b>${off.officer_name}</b><br/>Status: ${off.status}`);
    });

    // 5. diversion Detour Routes (main in indigo/blue, alternatives in amber/orange)
    if (diversionRoutes && diversionRoutes.length > 0) {
      diversionRoutes.forEach((route: any, idx: number) => {
        if (route.coordinates && route.coordinates.length > 0) {
          const isMain = idx === 0;
          const routeColor = isMain ? '#6366f1' : '#f59e0b';
          const isSelectedOrHovered = highlightedRouteIndex === idx;
          const noSelection = highlightedRouteIndex === undefined || highlightedRouteIndex === null;

          L.polyline(route.coordinates, {
            color: routeColor,
            weight: isSelectedOrHovered ? 7.0 : (isMain ? 4.5 : 3.0),
            opacity: isSelectedOrHovered ? 1.0 : (noSelection ? 0.75 : 0.2),
            dashArray: isMain ? '0' : '5, 5'
          }).addTo(map).bindPopup(`<b>${route.name}</b><br/>ETA: ${route.eta_mins} mins<br/>Delay saved: ${route.delay_saved_mins} mins`);
        }
      });
    }

    // 6. Centered Event pulse marker
    const eventIcon = L.divIcon({
      className: 'custom-event-icon',
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
               <span style="position:absolute;width:16px;height:16px;background-color:#ef4444;border-radius:50%;opacity:0.6;animation:ping 1.5s infinite"></span>
               <span style="position:relative;width:10px;height:10px;background-color:#ef4444;border-radius:50%;border:1.5px solid white"></span>
             </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    L.marker([centerLat, centerLon], { icon: eventIcon }).addTo(map)
      .bindPopup(`<b>Incident Target</b><br/>${selectedEvent?.junction || "Active Zone"}`);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [L, centerLat, centerLon, radiusM, officersData, diversionRoutes, geojsonVisualizations, highlightedRouteIndex, hideRadiusCircles, showZoneRisk]);

  return (
    <div 
      ref={mapContainerRef} 
      className="h-[360px] rounded-lg border border-slate-800 bg-slate-950 relative overflow-hidden" 
      style={{ zIndex: 0 }}
    />
  );
}


