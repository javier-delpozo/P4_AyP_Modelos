import { Collection, ObjectId } from "mongodb";
import {
  Proyecto,
  ProyectoModel,
  Tarea,
  TareaModel,
  User,
  UserModel,
} from "./types.ts";

export const fromModelToUser = async (
  model: UserModel,
  proyectosCollection: Collection<ProyectoModel>,
  usuariosCollection: Collection<UserModel>,
): Promise<User> => {
  const proyectos = await proyectosCollection.find({
    user_id: model._id,
  }).toArray();

  const proyectosMapped = await Promise.all(
    proyectos.map(async (p) => {
      const usuario = await usuariosCollection.findOne({ _id: p.user_id });
      if (!usuario) {
        throw new Error(`Usuario con ID ${p.user_id} no encontrado`);
      }
      return {
        id: p._id!.toString(),
        name: p.name,
        description: p.description,
        start_date: p.start_date,
        end_date: p.end_date,
        user_id: {
          id: usuario._id!.toString(),
          name: usuario.name,
          email: usuario.email,
          created_at: usuario.created_at,
        },
      };
    }),
  );

  return {
    id: model._id!.toString(),
    name: model.name,
    email: model.email,
    created_at: model.created_at,
  };
};

export const fromModelToProyecto = async (
  model: ProyectoModel,
  usuariosCollection: Collection<UserModel>,
): Promise<Proyecto> => {
  const userId = new ObjectId(model.user_id);
  const usuario = userId
    ? await usuariosCollection.findOne({ _id: userId })
    : null;

  // Retornar el proyecto con user_id, incluso si el usuario no fue encontrado
  return {
    id: model._id!.toString(),
    name: model.name,
    description: model.description,
    start_date: model.start_date,
    end_date: model.end_date,
    user_id: model.user_id, // Siempre incluir el ID original
  };
};

export const fromModelToTarea = async (
  model: TareaModel,
  proyectosCollection: Collection<ProyectoModel>,
): Promise<Tarea> => {
  const projectId = new ObjectId(model.project_id);
  const proyecto = projectId
    ? await proyectosCollection.findOne({ _id: projectId })
    : null;

  return {
    id: model._id!.toString(),
    title: model.title,
    description: model.description,
    status: model.status,
    created_at: model.created_at,
    due_date: model.due_date,
    project_id: model.project_id,
  };
};

export const fromModelToTareasPorProyecto = async (
  projectId: ObjectId,
  tareasCollection: Collection<TareaModel>,
): Promise<Tarea[]> => {
  // Buscar tareas asociadas al projectId
  const tareasDB = await tareasCollection.find({ project_id: projectId })
    .toArray();

  // Mapear los resultados al formato esperado, manteniendo project_id como ObjectId
  return tareasDB.map((tarea) => ({
    id: tarea._id!.toString(),
    title: tarea.title,
    description: tarea.description,
    status: tarea.status,
    created_at: tarea.created_at,
    due_date: tarea.due_date,
    project_id: tarea.project_id, // Dejarlo como ObjectId
  }));
};



export const fromModelToProyectosPorUsuario = async (
  userId: ObjectId,
  proyectosCollection: Collection<ProyectoModel>,
): Promise<Proyecto[]> => {
  // Buscar proyectos asociados al userId
  const proyectosDB = await proyectosCollection.find({ user_id: userId })
    .toArray();

  // Mapear los resultados al formato esperado, manteniendo project_id como ObjectId
  return proyectosDB.map((proyecto) => ({
    id: proyecto._id!.toString(),
    name: proyecto.name,
    description: proyecto.description,
    start_date: proyecto.start_date,
    end_date: proyecto.end_date,
    user_id: proyecto.user_id, // Dejarlo como ObjectId
  }));
};


export const moveTaskEntreProjects = async (
  taskId: ObjectId,
  destinationProjectId: ObjectId,
  tareasCollection: Collection<TareaModel>,
): Promise<TareaModel | null> => {
  const tarea = await tareasCollection.findOne({ _id: taskId });

  if (!tarea) {
    throw new Response("Task not found", { status: 404 });
  }

  const result = await tareasCollection.updateOne(
    { _id: taskId },
    { $set: { project_id: destinationProjectId } },
  );

  if (result.modifiedCount === 0) {
    throw new Response("Failed to move the task to the destination project", {
      status: 400,
    });
  }

  // Retornar la tarea actualizada
  return await tareasCollection.findOne({ _id: taskId });
};
