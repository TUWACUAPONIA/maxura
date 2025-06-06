import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/components/ui/use-toast";
import { cvService } from '@/services/cvService';
import { Brain, AlertCircle } from 'lucide-react'; // Importar el icono Brain y AlertCircle
import CreateJobAIForm from '../CreateJobAIForm.jsx'; // Importar el componente del formulario AI (ruta corregida)
import { APP_PLANS } from '@/config/plans'; // Importar APP_PLANS

function CreateNewJobTab({ setActiveTab, currentJobsCount, onJobPublishedOrUpdated, editingJob, setEditingJob }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobDetails, setJobDetails] = useState({
    title: '',
    description: '',
    ai_generated_description: '', // Campo para la descripción generada por IA
  });
  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // Estado para saber si estamos editando

  useEffect(() => {
    console.log("CreateNewJobTab useEffect: editingJob changed", editingJob);
    if (editingJob) {
      setJobDetails({
        title: editingJob.title || '',
        description: editingJob.description || '',
        ai_generated_description: editingJob.ai_generated_description || '', // Cargar descripción IA si existe
      });
      setIsEditing(true);
    } else {
      // Resetear el formulario si no estamos editando
      setJobDetails({
        title: '',
        description: '',
        ai_generated_description: '',
      });
      setIsEditing(false);
    }
  }, [editingJob]); // Dependencia: editingJob

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setJobDetails(prevDetails => ({
      ...prevDetails,
      [name]: value,
    }));
  };

  const handleSaveJob = async () => {
    console.log("CreateNewJobTab: handleSaveJob called");
    if (!user?.id) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }

    if (!jobDetails.title || (!jobDetails.description && !jobDetails.ai_generated_description)) {
      toast({ title: "Error", description: "El título y la descripción (o descripción IA) del puesto son obligatorios.", variant: "destructive" });
      return;
    }

    setIsProcessingJob(true);
    try {
      const planId = user.suscripcion?.plan_id || 'basico'; // Fallback a 'basico' si no hay suscripción
      const status = user.suscripcion?.status;
      // Obtener jobLimit de APP_PLANS
      const jobLimit = APP_PLANS[planId]?.jobLimit || 0;

      // Verificar estado de suscripción si no estamos editando
      if (!isEditing && (status !== 'active' && status !== 'trialing')) {
        toast({
          title: "Suscripción no activa",
          description: "Tu suscripción no está activa. Por favor, revisa tu plan.",
          variant: "destructive",
        });
        setIsProcessingJob(false);
        return;
      }

      // La verificación de límite solo aplica si NO estamos editando.
      // Si estamos editando, permitimos la actualización sin contar contra el límite de *nuevos* puestos.
      if (!isEditing && currentJobsCount >= jobLimit) {
        toast({
          title: "Límite de Puestos Alcanzado",
          description: `Has alcanzado el límite de ${jobLimit === Infinity ? 'puestos ilimitados' : `${jobLimit} puestos activos`} para tu plan "${APP_PLANS[planId]?.name || planId}". Considera actualizar tu plan para crear más.`,
          variant: "destructive",
          duration: 7000,
        });
        setIsProcessingJob(false);
        return;
      }

      const jobDataToSave = {
        recruiter_id: user.id,
        title: jobDetails.title,
        description: jobDetails.description || jobDetails.ai_generated_description, // Usar descripción IA si no hay manual
        ai_generated_description: jobDetails.ai_generated_description, // Guardar también la descripción IA original
        // Otros campos del job si los hay
      };

      let savedJob;
      if (isEditing && editingJob?.id) {
        console.log("CreateNewJobTab: Updating job with ID:", editingJob.id);
        savedJob = await cvService.updateJobPost(editingJob.id, jobDataToSave);
        toast({ title: "Puesto Actualizado", description: "El puesto de trabajo ha sido actualizado." });
      } else {
        console.log("CreateNewJobTab: Creating new job");
        savedJob = await cvService.createJobPost(jobDataToSave);
        toast({ title: "Puesto Publicado", description: "Se ha creado un nuevo puesto de trabajo." });
      }

      // Llamar a la función para actualizar la lista en el Dashboard
      if (onJobPublishedOrUpdated) {
        onJobPublishedOrUpdated(savedJob);
      }

      // Limpiar el formulario y estado de edición después de guardar/actualizar
      setJobDetails({ title: '', description: '', ai_generated_description: '' });
      setEditingJob(null); // Limpiar el job en edición en el Dashboard
      setIsEditing(false); // Asegurarse de que el estado local también se resetee

      // Opcional: Cambiar a la pestaña de puestos publicados
      if (setActiveTab) {
        setActiveTab("puestosPublicados");
      }

    } catch (error) {
      console.error('Error al guardar/actualizar el puesto:', error);
      toast({
        title: "Error al guardar puesto",
        description: `No se pudo guardar el puesto: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessingJob(false);
    }
  };

  // Determinar si se puede crear un nuevo puesto (solo si NO estamos editando)
  const planId = user?.suscripcion?.plan_id || 'basico';
  const status = user?.suscripcion?.status;
  // Obtener jobLimit de APP_PLANS
  const jobLimit = APP_PLANS[planId]?.jobLimit || 0;
  // canCreateJob ahora solo se aplica si NO estamos editando. Si estamos editando, siempre se puede intentar guardar.
  const canCreateNewJob = !isEditing && (status === 'active' || status === 'trialing') && currentJobsCount < jobLimit;
  const limitReachedForNew = !isEditing && (status === 'active' || status === 'trialing') && currentJobsCount >= jobLimit;
  const formDisabledOverall = isEditing ? isProcessingJob : (!canCreateNewJob || isProcessingJob);


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 md:p-8 rounded-xl shadow-xl space-y-6"
    >
      <h2 className="text-2xl font-semibold text-slate-800 mb-4">{isEditing ? 'Editar Puesto de Trabajo' : 'Crear Nuevo Puesto de Trabajo'}</h2>

      {/* Mensaje de Límite Alcanzado (solo si NO estamos editando) */}
      {limitReachedForNew && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md shadow">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Has alcanzado el límite de <strong className="font-semibold">{jobLimit === Infinity ? 'puestos ilimitados' : `${jobLimit} puestos activos`}</strong> para tu plan <strong className="font-semibold capitalize">{APP_PLANS[planId]?.name || planId}</strong>.
                Para crear más puestos, por favor considera <a href="/#pricing" className="underline hover:text-yellow-600">actualizar tu plan</a>.
              </p>
            </div>
          </div>
        </div>
      )}

       {/* Mensaje de Suscripción no activa (solo si NO estamos editando) */}
       {!isEditing && !(status === 'active' || status === 'trialing') && user?.suscripcion && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-md shadow">
           <div className="flex">
             <div className="flex-shrink-0">
               <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
             </div>
             <div className="ml-3">
               <p className="text-sm text-red-700">
                 Tu suscripción actual (<strong className="font-semibold capitalize">{status}</strong>) no te permite crear nuevos puestos.
                 Por favor, <a href="/#pricing" className="underline hover:text-red-600">revisa tu plan</a> o contacta a soporte.
               </p>
             </div>
           </div>
         </div>
        )}


      {/* Formulario de Puesto de Trabajo */}
      <div className={`space-y-4 ${formDisabledOverall ? 'opacity-50 pointer-events-none' : ''}`}>
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">Título del Puesto</label>
          <Input
            type="text"
            id="title"
            name="title"
            value={jobDetails.title}
            onChange={handleInputChange}
            placeholder="Ej: Desarrollador Frontend Senior"
            disabled={formDisabledOverall}
          />
        </div>

        {/* Asistente IA para Creación de Puestos */}
        <CreateJobAIForm
          onDescriptionGenerated={(aiDescription) => {
            setJobDetails(prevDetails => ({
              ...prevDetails,
              ai_generated_description: aiDescription,
              // Opcional: si quieres que la descripción IA sobrescriba la manual al generar
              // description: aiDescription,
            }));
          }}
          currentDescription={jobDetails.description || jobDetails.ai_generated_description} // Pasar la descripción actual (manual o IA)
          disabled={formDisabledOverall}
        />

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">Descripción del Puesto (Manual)</label>
          <Textarea
            id="description"
            name="description"
            value={jobDetails.description}
            onChange={handleInputChange}
            placeholder="Describe detalladamente el puesto, responsabilidades, requisitos, etc."
            rows="6"
            disabled={formDisabledOverall}
          />
           <p className="mt-1 text-sm text-slate-500">
            Si generaste una descripción con IA, puedes editarla aquí o añadir detalles adicionales.
          </p>
        </div>

        {/* Botón de Guardar */}
        <Button
          onClick={handleSaveJob}
          disabled={formDisabledOverall}
          className="w-full"
        >
          {isProcessingJob ? (isEditing ? 'Actualizando...' : 'Creando...') : (isEditing ? 'Actualizar Puesto' : 'Publicar Puesto')}
        </Button>
      </div>
    </motion.div>
  );
}

export default CreateNewJobTab;