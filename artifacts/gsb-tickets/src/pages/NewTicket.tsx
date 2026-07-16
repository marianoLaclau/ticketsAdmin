import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  useCreateTicket, 
  TicketInputEstado, 
  TicketInputPrioridad 
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Save, Building, User, Phone, Mail, FileText, AlertTriangle } from 'lucide-react';

const formSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  apellido: z.string().min(2, 'El apellido es obligatorio'),
  telefono: z.string().optional(),
  dni: z.string().optional(),
  empresa: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  motivo: z.string().min(5, 'El motivo es obligatorio y debe ser descriptivo'),
  resumen: z.string().optional(),
  prioridad: z.enum(['baja', 'media', 'alta', 'urgente']),
  estado: z.enum(['nuevo', 'en_proceso', 'pendiente', 'resuelto', 'cerrado']),
  notas: z.string().optional(),
  fecha_limite: z.string().optional(),
});

export default function NewTicket() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTicket = useCreateTicket();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: '',
      apellido: '',
      telefono: '',
      dni: '',
      empresa: '',
      email: '',
      motivo: '',
      resumen: '',
      prioridad: 'media',
      estado: 'nuevo',
      notas: '',
      fecha_limite: '',
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    // Generar un ID de conversación dummy, en app real esto podría venir de centralita
    const conversationId = `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const hora = new Date().toISOString();

    const ticketData = {
      ...values,
      conversation_id: conversationId,
      hora,
      progreso: 0,
      notificado: false
    };

    createTicket.mutate(
      { data: ticketData },
      {
        onSuccess: (data: any) => {
          queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
          toast({
            title: 'Ticket creado',
            description: `Se ha creado el ticket #${data.id} exitosamente.`,
          });
          setLocation(`/tickets/${data.id}`);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo crear el ticket. Intente nuevamente.",
          });
        }
      }
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => window.history.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nuevo Ticket</h1>
          <p className="text-slate-500 mt-1">Registrar un nuevo caso o llamada entrante.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Col - Contact Info */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Información de Contacto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nombre"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Juan" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="apellido"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Apellido *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Pérez" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dni"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>DNI / CUIT</FormLabel>
                          <FormControl>
                            <Input placeholder="Sin puntos ni guiones" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="telefono"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <Input className="pl-9" placeholder="Cod. área + número" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input type="email" className="pl-9" placeholder="correo@ejemplo.com" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="empresa"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empresa / Cliente</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input className="pl-9" placeholder="Razón social" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Col - Case Details */}
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Detalles del Caso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="motivo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motivo Principal *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. Reclamo por factura duplicada" {...field} />
                        </FormControl>
                        <FormDescription>Título corto para identificar el caso</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="resumen"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción detallada</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describa el problema, solicitud o contexto de la llamada..." 
                            className="min-h-[120px] resize-y" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <FormField
                      control={form.control}
                      name="prioridad"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prioridad</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione prioridad" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="baja">Baja</SelectItem>
                              <SelectItem value="media">Media</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                              <SelectItem value="urgente">Urgente</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fecha_limite"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha Límite</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex justify-end gap-4 border-t border-slate-200 pt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => window.history.back()}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="bg-primary text-white"
              disabled={createTicket.isPending}
            >
              {createTicket.isPending ? (
                <>Guardando...</>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Crear Ticket
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}