import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { searchSolarSystems, getJobs, createJob, claimJob, completeJob } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Plus, 
  Check, 
  Upload, 
  ArrowRight, 
  Clock, 
  DollarSign, 
  ShieldAlert, 
  Navigation 
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { SolarSystem, Job, JobInsert, JobStatus } from "@shared/schema";

// Schema for job creation
const createJobSchema = z.object({
  fromSystemId: z.number({
    required_error: "Start system is required",
  }),
  fromSystemName: z.string(),
  toSystemId: z.number({
    required_error: "Destination system is required",
  }),
  toSystemName: z.string(),
  reward: z.string().min(1, "Reward is required").transform(val => parseFloat(val)),
  expiresInMinutes: z.string().min(1, "Expiry time is required").transform(val => parseInt(val)),
});

// Schema for job claiming
const claimJobSchema = z.object({
  scoutPubKey: z.string().min(1, "Your public key is required"),
});

// Schema for job completion
const completeJobSchema = z.object({
  routeProof: z.string().min(1, "Route proof is required"),
  scoutPubKey: z.string().min(1, "Your public key is required"),
});

// Convert job status to human readable format
const formatJobStatus = (status: JobStatus) => {
  switch (status) {
    case 'open':
      return <Badge variant="outline">Open</Badge>;
    case 'claimed':
      return <Badge variant="secondary">Claimed</Badge>;
    case 'completed':
      return <Badge variant="success">Completed</Badge>;
    case 'expired':
      return <Badge variant="destructive">Expired</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export function ScoutJobModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("create");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [fromSystemSearch, setFromSystemSearch] = useState("");
  const [toSystemSearch, setToSystemSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create job form
  const createForm = useForm<z.infer<typeof createJobSchema>>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      fromSystemName: "",
      toSystemName: "",
      reward: "",
      expiresInMinutes: "60", // Default 1 hour
    },
  });

  // Claim job form
  const claimForm = useForm<z.infer<typeof claimJobSchema>>({
    resolver: zodResolver(claimJobSchema),
    defaultValues: {
      scoutPubKey: "",
    },
  });

  // Complete job form
  const completeForm = useForm<z.infer<typeof completeJobSchema>>({
    resolver: zodResolver(completeJobSchema),
    defaultValues: {
      routeProof: "",
      scoutPubKey: "",
    },
  });

  // Search for systems (from)
  const { data: fromSystemResults } = useQuery({
    queryKey: ["/api/systems/search", fromSystemSearch],
    enabled: fromSystemSearch.length > 2,
  });

  // Search for systems (to)
  const { data: toSystemResults } = useQuery({
    queryKey: ["/api/systems/search", toSystemSearch],
    enabled: toSystemSearch.length > 2,
  });

  // Fetch available jobs
  const { data: jobsData, isLoading: isLoadingJobs, refetch: refetchJobs } = useQuery({
    queryKey: ["/api/jobs", activeTab === "claim" ? "open" : undefined],
    enabled: open && (activeTab === "claim" || activeTab === "complete"),
  });

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      toast({
        title: "Job Created",
        description: "Your scouting job has been posted successfully.",
      });
      setActiveTab("claim");
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Create Job",
        description: String(error),
      });
    },
  });

  // Claim job mutation
  const claimJobMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: z.infer<typeof claimJobSchema> }) => 
      claimJob(id, data),
    onSuccess: () => {
      toast({
        title: "Job Claimed",
        description: "You have successfully claimed this job.",
      });
      setActiveTab("complete");
      claimForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Claim Job",
        description: String(error),
      });
    },
  });

  // Complete job mutation
  const completeJobMutation = useMutation({
    mutationFn: ({ id, data, scoutPubKey }: { 
      id: number; 
      data: { routeProof: string }; 
      scoutPubKey: string;
    }) => completeJob(id, data, scoutPubKey),
    onSuccess: () => {
      toast({
        title: "Job Completed",
        description: "You have successfully completed this job.",
      });
      setSelectedJob(null);
      completeForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Complete Job",
        description: String(error),
      });
    },
  });

  // Handle job creation submission
  const onCreateJobSubmit = (values: z.infer<typeof createJobSchema>) => {
    createJobMutation.mutate(values as JobInsert);
  };

  // Handle job claim submission
  const onClaimJobSubmit = (values: z.infer<typeof claimJobSchema>) => {
    if (!selectedJob) {
      toast({
        variant: "destructive",
        title: "No Job Selected",
        description: "Please select a job to claim.",
      });
      return;
    }
    claimJobMutation.mutate({ id: selectedJob.id, data: values });
  };

  // Handle job completion submission
  const onCompleteJobSubmit = (values: z.infer<typeof completeJobSchema>) => {
    if (!selectedJob) {
      toast({
        variant: "destructive",
        title: "No Job Selected",
        description: "Please select a job to complete.",
      });
      return;
    }
    completeJobMutation.mutate({ 
      id: selectedJob.id, 
      data: { routeProof: values.routeProof }, 
      scoutPubKey: values.scoutPubKey
    });
  };

  // Handle selecting a system for the "from" field
  const handleSelectFromSystem = (system: SolarSystem) => {
    createForm.setValue("fromSystemId", system.id);
    createForm.setValue("fromSystemName", system.name);
    setFromSystemSearch("");
  };

  // Handle selecting a system for the "to" field
  const handleSelectToSystem = (system: SolarSystem) => {
    createForm.setValue("toSystemId", system.id);
    createForm.setValue("toSystemName", system.name);
    setToSystemSearch("");
  };

  // Reset forms when modal closes
  useEffect(() => {
    if (!open) {
      createForm.reset();
      claimForm.reset();
      completeForm.reset();
      setSelectedJob(null);
    }
  }, [open, createForm, claimForm, completeForm]);

  // Generate route JSON proof for testing purposes
  const generateRouteProof = () => {
    if (!selectedJob) {
    
    const now = new Date();
    const routeProof = {
      jobId: selectedJob.id,
      fromSystemId: selectedJob.fromSystemId,
      toSystemId: selectedJob.toSystemId,
      timestamp: now.toISOString(),
      jumps: [
        {
          systemId: selectedJob.fromSystemId,
          timestamp: new Date(now.getTime() - 5000).toISOString()
        },
        {
          systemId: selectedJob.toSystemId,
          timestamp: now.toISOString()
        }
      ],
      scout: completeForm.getValues("scoutPubKey")
    };
    
    completeForm.setValue("routeProof", JSON.stringify(routeProof, null, 2));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Navigation className="h-4 w-4" />
          Scout Jobs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Scout Jobs Marketplace</DialogTitle>
          <DialogDescription>
            Create, claim, and complete paid scouting runs through dangerous space.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="create">Create Job</TabsTrigger>
            <TabsTrigger value="claim">Claim Job</TabsTrigger>
            <TabsTrigger value="complete">Complete Job</TabsTrigger>
          </TabsList>

          {/* Create Job Tab */}
          <TabsContent value="create">
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateJobSubmit)} className="space-y-4">
                {/* From System */}
                <FormField
                  control={createForm.control}
                  name="fromSystemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From System</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={createForm.watch("fromSystemName") || "Search start system..."}
                            value={fromSystemSearch}
                            onChange={(e) => setFromSystemSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                      {fromSystemSearch.length > 2 && fromSystemResults && (
                        <Card className="absolute z-10 w-full max-h-48 overflow-auto">
                          <CardContent className="p-0">
                            {fromSystemResults.map((system: SolarSystem) => (
                              <Button
                                key={system.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => handleSelectFromSystem(system)}
                              >
                                {system.name}
                              </Button>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </FormItem>
                  )}
                />

                {/* To System */}
                <FormField
                  control={createForm.control}
                  name="toSystemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To System</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={createForm.watch("toSystemName") || "Search destination system..."}
                            value={toSystemSearch}
                            onChange={(e) => setToSystemSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                      {toSystemSearch.length > 2 && toSystemResults && (
                        <Card className="absolute z-10 w-full max-h-48 overflow-auto">
                          <CardContent className="p-0">
                            {toSystemResults.map((system: SolarSystem) => (
                              <Button
                                key={system.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => handleSelectToSystem(system)}
                              >
                                {system.name}
                              </Button>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </FormItem>
                  )}
                />

                {/* Reward */}
                <FormField
                  control={createForm.control}
                  name="reward"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reward (ISK)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input {...field} type="number" className="pl-10" placeholder="1000000" />
                        </div>
                      </FormControl>
                      <FormDescription>
                        The amount of ISK to reward the scout upon completion.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Expiry Time */}
                <FormField
                  control={createForm.control}
                  name="expiresInMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires In (minutes)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input {...field} type="number" className="pl-10" placeholder="60" />
                        </div>
                      </FormControl>
                      <FormDescription>
                        How long the job will remain available before expiring.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createJobMutation.isPending}
                    className="w-full"
                  >
                    {createJobMutation.isPending ? "Creating..." : "Create Job"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          {/* Claim Job Tab */}
          <TabsContent value="claim">
            <div className="space-y-4">
              <div className="border rounded-md h-48 overflow-y-auto">
                {isLoadingJobs ? (
                  <div className="p-4 text-center">Loading jobs...</div>
                ) : jobsData?.data.length === 0 ? (
                  <div className="p-4 text-center">No open jobs available.</div>
                ) : (
                  jobsData?.data.map((job: Job) => (
                    <Card 
                      key={job.id} 
                      className={`mb-2 cursor-pointer hover:bg-muted/50 ${selectedJob?.id === job.id ? 'border-primary' : ''}`}
                      onClick={() => setSelectedJob(job)}
                    >
                      <CardHeader className="p-3">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-sm">
                            {job.fromSystemName} <ArrowRight className="inline h-3 w-3" /> {job.toSystemName}
                          </CardTitle>
                          <div className="flex gap-2 items-center">
                            <Badge variant="outline">
                              <DollarSign className="h-3 w-3 mr-1" /> 
                              {job.reward.toLocaleString()}
                            </Badge>
                            {formatJobStatus(job.status)}
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))
                )}
              </div>

              {selectedJob && selectedJob.status === 'open' && (
                <Form {...claimForm}>
                  <form onSubmit={claimForm.handleSubmit(onClaimJobSubmit)} className="space-y-4">
                    <FormField
                      control={claimForm.control}
                      name="scoutPubKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Public Key</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter your public key" />
                          </FormControl>
                          <FormDescription>
                            This will be used to verify your identity when completing the job.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button 
                        type="submit" 
                        disabled={claimJobMutation.isPending}
                        className="w-full"
                      >
                        {claimJobMutation.isPending ? "Claiming..." : "Claim Job"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>

          {/* Complete Job Tab */}
          <TabsContent value="complete">
            <div className="space-y-4">
              <div className="border rounded-md h-48 overflow-y-auto">
                {isLoadingJobs ? (
                  <div className="p-4 text-center">Loading jobs...</div>
                ) : jobsData?.data.filter((job: Job) => job.status === "claimed").length === 0 ? (
                  <div className="p-4 text-center">No claimed jobs available.</div>
                ) : (
                  jobsData?.data
                    .filter((job: Job) => job.status === "claimed")
                    .map((job: Job) => (
                      <Card 
                        key={job.id} 
                        className={`mb-2 cursor-pointer hover:bg-muted/50 ${selectedJob?.id === job.id ? 'border-primary' : ''}`}
                        onClick={() => setSelectedJob(job)}
                      >
                        <CardHeader className="p-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-sm">
                              {job.fromSystemName} <ArrowRight className="inline h-3 w-3" /> {job.toSystemName}
                            </CardTitle>
                            <div className="flex gap-2 items-center">
                              <Badge variant="outline">
                                <DollarSign className="h-3 w-3 mr-1" /> 
                                {job.reward.toLocaleString()}
                              </Badge>
                              {formatJobStatus(job.status)}
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))
                )}
              </div>

              {selectedJob && selectedJob.status === 'claimed' && (
                <Form {...completeForm}>
                  <form onSubmit={completeForm.handleSubmit(onCompleteJobSubmit)} className="space-y-4">
                    <FormField
                      control={completeForm.control}
                      name="scoutPubKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Public Key</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter your public key" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={completeForm.control}
                      name="routeProof"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between">
                            <FormLabel>Route Proof (JSON)</FormLabel>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={generateRouteProof}
                            >
                              Generate Demo Proof
                            </Button>
                          </div>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Paste your route proof JSON" 
                              rows={6}
                            />
                          </FormControl>
                          <FormDescription>
                            Upload your journey proof JSON containing the route details and timestamps.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button 
                        type="submit" 
                        disabled={completeJobMutation.isPending}
                        className="w-full"
                      >
                        {completeJobMutation.isPending ? "Submitting..." : "Complete Job"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
} 