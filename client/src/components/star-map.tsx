import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import {
  calculateMapCoordinates, 
  getConnectionsForVisualization,
  generateNodeSizes,
  getRiskCategory
} from "@/lib/pathfinding";
import { SystemDetailsTooltip } from "./system-details-tooltip";
import type { SolarSystem, RiskData, SystemConnection, RouteResponse } from "@shared/schema";

interface StarMapProps {
  systems: SolarSystem[];
  connections: SystemConnection[];
  riskData: RiskData[];
  selectedRoute: RouteResponse | null;
  isLoading: boolean;
  startSystem: SolarSystem | null;
  endSystem: SolarSystem | null;
  onSystemSelect: (system: SolarSystem) => void;
}

export function StarMap({ 
  systems, 
  connections, 
  riskData, 
  selectedRoute,
  isLoading,
  startSystem,
  endSystem,
  onSystemSelect
}: StarMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredSystem, setHoveredSystem] = useState<SolarSystem | null>(null);
  const [hoveredSystemRisk, setHoveredSystemRisk] = useState<RiskData | null>(null);
  
  useEffect(() => {
    if (!svgRef.current || systems.length === 0) return;
    
    // Create risk data map for quick lookup
    const riskDataMap = new Map<number, RiskData>();
    riskData.forEach(data => riskDataMap.set(data.systemId, data));
    
    // Calculate node sizes based on connectivity
    const nodeSizes = generateNodeSizes(systems, connections);
    
    // Calculate coordinates for 2D visualization
    const coordinatesMap = calculateMapCoordinates(systems);
    
    // Get connections for visualization
    const visualConnections = getConnectionsForVisualization(
      connections, 
      coordinatesMap,
      riskDataMap
    );
    
    // Set up SVG
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Clear previous content
    svg.selectAll("*").remove();
    
    // Add definitions for markers and filters
    const defs = svg.append("defs");
    
    // Glow filter
    defs.append("filter")
      .attr("id", "glow")
      .append("feGaussianBlur")
      .attr("stdDeviation", "2.5")
      .attr("result", "coloredBlur");
    
    // Arrow marker for routes
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", "5")
      .attr("refY", "5")
      .attr("markerWidth", "6")
      .attr("markerHeight", "6")
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", "hsl(var(--primary))");
    
    // Create connection lines
    const connectionGroup = svg.append("g")
      .attr("class", "connections");
    
    visualConnections.forEach((conn: any) => {
      if (!conn) return;
      
      // Scale coordinates to SVG dimensions
      const x1 = conn.source.x * width;
      const y1 = conn.source.y * height;
      const x2 = conn.target.x * width;
      const y2 = conn.target.y * height;
      
      // Get risk category for styling
      const riskColor = conn.riskCategory === "safe" 
        ? "hsl(var(--safe))" 
        : conn.riskCategory === "warning" 
          ? "hsl(var(--warning))" 
          : "hsl(var(--danger))";
      
      // Determine opacity based on risk
      const opacity = 0.2 + (conn.risk * 0.3);
      
      connectionGroup.append("path")
        .attr("d", `M ${x1},${y1} L ${x2},${y2}`)
        .attr("stroke", "hsl(var(--muted))")
        .attr("stroke-width", 1)
        .attr("opacity", opacity);
    });
    
    // Create a route group regardless of whether there's a route
    // This avoids the undefined variable error
    const routeGroup = svg.append("g")
      .attr("class", "route");
      
    // Draw selected route if available
    if (selectedRoute && selectedRoute.jumps.length > 0) {
      // Build route path
      const routeSystemIds = selectedRoute.jumps.map(jump => [jump.fromSystemId, jump.toSystemId])
        .flat()
        .filter((value, index, self) => self.indexOf(value) === index);
      
      // Generate route coordinates
      const routeCoordinates: [number, number][] = [];
      
      routeSystemIds.forEach(systemId => {
        const coords = coordinatesMap.get(systemId);
        if (coords) {
          routeCoordinates.push([
            coords.x * width,
            coords.y * height
          ]);
        }
      });
      
      // Create route line
      if (routeCoordinates.length >= 2) {
        const lineGenerator = d3.line();
        
        const routePath = routeGroup.append("path")
          .attr("d", lineGenerator(routeCoordinates))
          .attr("stroke", "hsl(var(--primary))")
          .attr("stroke-width", 3)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .attr("fill", "none")
          .attr("filter", "url(#glow)")
          .attr("marker-end", "url(#arrow)");
        
        // Animate path if not already animated by CSS
        routePath.attr("class", "route-path");
      }
    }
    
    // Create system nodes
    const systemGroup = svg.append("g")
      .attr("class", "systems");
    
    systems.forEach(system => {
      const coords = coordinatesMap.get(system.id);
      if (!coords) return;
      
      const x = coords.x * width;
      const y = coords.y * height;
      
      // Get risk level
      const risk = riskDataMap.get(system.id)?.riskScore || 0.3;
      const riskCategory = getRiskCategory(risk);
      
      // Determine color based on risk
      const fillColor = riskCategory === "safe" 
        ? "hsl(var(--safe))" 
        : riskCategory === "warning" 
          ? "hsl(var(--warning))" 
          : "hsl(var(--danger))";
      
      // Is this system in the selected route?
      const isInRoute = selectedRoute?.jumps.some(
        jump => jump.fromSystemId === system.id || jump.toSystemId === system.id
      );
      
      // Check if this system is currently selected as start or end
      const isSelectedStart = startSystem && startSystem.id === system.id;
      const isSelectedEnd = endSystem && endSystem.id === system.id;
      
      // Is this system a start or end point in a calculated route?
      const isRouteStartOrEnd = selectedRoute?.jumps.length ? (
        system.id === selectedRoute.jumps[0].fromSystemId || 
        system.id === selectedRoute.jumps[selectedRoute.jumps.length - 1].toSystemId
      ) : false;
      
      // Determine node size - larger for route systems and selected systems
      const baseSize = nodeSizes.get(system.id) || 7;
      const size = isInRoute || isSelectedStart || isSelectedEnd ? baseSize * 1.3 : baseSize;
      
      // Create system group
      const systemNode = systemGroup.append("g")
        .attr("class", "star-system")
        .attr("data-system-id", system.id)
        .attr("transform", `translate(${x}, ${y})`)
        .attr("cursor", "pointer")
        .on("click", () => {
          // Find the corresponding system object
          const clickedSystem = systems.find(s => s.id === system.id);
          if (clickedSystem) {
            onSystemSelect(clickedSystem);
          }
        })
        .on("mouseenter", () => {
          // Show system details tooltip on hover
          const hoveredSystemObj = systems.find(s => s.id === system.id);
          const hoveredSystemRiskData = riskDataMap.get(system.id) || null;
          
          if (hoveredSystemObj) {
            setHoveredSystem(hoveredSystemObj);
            setHoveredSystemRisk(hoveredSystemRiskData);
          }
        })
        .on("mouseleave", () => {
          // Hide tooltip when mouse leaves
          setHoveredSystem(null);
          setHoveredSystemRisk(null);
        });
      
      // Add selection indicator for start/end systems (outer ring)
      if (isSelectedStart || isSelectedEnd) {
        systemNode.append("circle")
          .attr("r", size + 3)
          .attr("fill", "none")
          .attr("stroke", isSelectedStart ? "hsl(var(--primary))" : "hsl(var(--secondary))")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", isSelectedStart ? "none" : "4,2");
      }
      
      // Add outer circle (risk indicator)
      systemNode.append("circle")
        .attr("r", size)
        .attr("fill", fillColor)
        .attr("filter", (isRouteStartOrEnd || isSelectedStart || isSelectedEnd) ? "url(#glow)" : null);
      
      // Add inner circle (core)
      systemNode.append("circle")
        .attr("r", size / 2)
        .attr("fill", isSelectedStart ? "hsl(var(--primary))" : 
                      isSelectedEnd ? "hsl(var(--secondary))" : "#fff");
      
      // Add system name
      systemNode.append("text")
        .attr("x", 0)
        .attr("y", size + 8)
        .attr("text-anchor", "middle")
        .attr("fill", "hsl(var(--foreground))")
        .attr("font-size", (isInRoute || isSelectedStart || isSelectedEnd) ? 11 : 9)
        .attr("font-weight", (isInRoute || isSelectedStart || isSelectedEnd) ? 600 : 400)
        .text(system.name);
      
      // Add selection label if it's a start or end system
      if (isSelectedStart) {
        systemNode.append("text")
          .attr("x", 0)
          .attr("y", -size - 5)
          .attr("text-anchor", "middle")
          .attr("fill", "hsl(var(--primary))")
          .attr("font-size", 10)
          .attr("font-weight", 600)
          .text("START");
      } else if (isSelectedEnd) {
        systemNode.append("text")
          .attr("x", 0)
          .attr("y", -size - 5)
          .attr("text-anchor", "middle")
          .attr("fill", "hsl(var(--secondary))")
          .attr("font-size", 10)
          .attr("font-weight", 600)
          .text("END");
      }
    });
    
    // Add zoom and pan functionality with further expanded zoom range
    const zoom = d3.zoom()
      .scaleExtent([0.2, 20]) // Allow much higher zoom level for dense clusters
      .on("zoom", (event) => {
        connectionGroup.attr("transform", event.transform);
        if (routeGroup) routeGroup.attr("transform", event.transform);
        systemGroup.attr("transform", event.transform);
        setZoom(event.transform.k);
      });
    
    svg.call(zoom as any);
    
  }, [systems, connections, riskData, selectedRoute, startSystem, endSystem, onSystemSelect]);
  
  // Handle Zoom In with more aggressive scaling
  const handleZoomIn = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentZoom = zoom;
    // Use stronger zoom factor (2.0 instead of 1.2) to quickly zoom into clustered areas
    svg.transition().call((d3.zoom() as any).scaleBy, 2.0);
    setZoom(currentZoom * 2.0);
  };
  
  // Handle Zoom Out with more aggressive scaling
  const handleZoomOut = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentZoom = zoom;
    // Use stronger zoom out factor (0.5 instead of 0.8) to quickly zoom out from dense clusters
    svg.transition().call((d3.zoom() as any).scaleBy, 0.5);
    setZoom(currentZoom * 0.5);
  };
  
  // Handle Reset Zoom/Pan
  const handleResetZoom = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().call((d3.zoom() as any).transform, d3.zoomIdentity);
    setZoom(1);
  };
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-0">
        <div className="flex justify-between items-center">
          <CardTitle>Star Map</CardTitle>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleZoomIn} 
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleZoomOut} 
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleResetZoom} 
              title="Reset View"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-2 relative" ref={containerRef}>
        {/* Display system details tooltip for the currently hovered system */}
        {hoveredSystem && (
          <div className="absolute top-4 right-4 z-10">
            <SystemDetailsTooltip 
              system={hoveredSystem}
              riskData={hoveredSystemRisk || undefined}
            >
              <div className="hidden">Tooltip Trigger</div>
            </SystemDetailsTooltip>
          </div>
        )}
        <svg 
          ref={svgRef} 
          className="w-full h-full bg-black/5 dark:bg-white/5 rounded-lg"
          style={{ transform: `scale(${zoom})` }}
        ></svg>
      </CardContent>
    </Card>
  );
}
