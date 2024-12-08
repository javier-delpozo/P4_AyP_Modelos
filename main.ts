import { MongoClient, ObjectId } from "mongodb";
import { ProyectoModel, TareaModel, User, UserModel } from "./types.ts";
import {
  fromModelToProyecto,
  fromModelToProyectosPorUsuario,
  fromModelToTarea,
  fromModelToTareasPorProyecto,
  fromModelToUser,
  moveTaskEntreProjects,
} from "./utils.ts";

const MONGO_URL = Deno.env.get("MONGO_URL");
if (!MONGO_URL) {
  throw new Error("Need a MONGO_URL");
 
}

const client = new MongoClient(MONGO_URL);
await client.connect();
console.info("Connected to MongoDB");

const db = client.db("Practica4Modelos");
const usuariosCollection = db.collection<UserModel>("usuariosP4");
const proyectosCollection = db.collection<ProyectoModel>("proyectosP4");
const tareasCollection = db.collection<TareaModel>("tareasP4");

const handler = async (req: Request): Promise<Response> => {
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname;

  if (method === "GET") {
    if (path === "/users") {
      const usersDB = await usuariosCollection.find().toArray();
      const users = await Promise.all(
        usersDB.map((u) =>
          fromModelToUser(u, proyectosCollection, usuariosCollection)
        ),
      );
      return new Response(JSON.stringify(users));
    } else if (path === "/projects") {
      const projectsDB = await proyectosCollection.find().toArray();
      const projects = await Promise.all(
        projectsDB.map((p) => fromModelToProyecto(p, usuariosCollection)),
      );
      return new Response(JSON.stringify(projects));
    } else if (path === "/tasks") {
      const tasksDB = await tareasCollection.find().toArray();
      const tasks = await Promise.all(
        tasksDB.map((t) => fromModelToTarea(t, proyectosCollection)),
      );
      return new Response(JSON.stringify(tasks));
    } else if (path === "/tasks/by-project") {
      const url = new URL(req.url);
      const projectIdString = url.searchParams.get("project_id");

      // Validar que el parámetro project_id se haya proporcionado
      if (!ObjectId.isValid(projectIdString)) {
        return new Response("El parámetro project_id es requerido", {
          status: 400,
        });
      }

      // Convertir projectIdString a ObjectId
      const projectId = new ObjectId(projectIdString);

      // Obtener las tareas asociadas al proyecto
      const tareas = await fromModelToTareasPorProyecto(
        projectId,
        tareasCollection,
      );

      // Responder con las tareas encontradas
      return new Response(JSON.stringify(tareas), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    
  } else if (path === "/projects/by-user") {
    const url = new URL(req.url);
    const userIdString = url.searchParams.get("user_id");

    // Validar que el parámetro project_id se haya proporcionado
    if ((!ObjectId.isValid(userIdString))) {
      return new Response("El parámetro user_id es requerido", {
        status: 400,
      });
    }

    // Convertir projectIdString a ObjectId
    const userId = new ObjectId(userIdString);

    // Obtener los proyectos asociados al usuario
    const proyectos = await fromModelToProyectosPorUsuario(
      userId,
      proyectosCollection,
    );

    // Responder con los proyectos encontrados
    return new Response(JSON.stringify(proyectos), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  } else if (method === "POST") {
    if (path === "/users") {
      const user = await req.json();
      const date = new Date();
      if (!user.name || !user.email) {
        return new Response("Bad request: Name and email are required", {
          status: 404,
        });
      }
      // Check if user exists by email
      const userDB = await usuariosCollection.findOne({ email: user.email });
      if (userDB) return new Response("User already exist", { status: 409 });

      const { insertedId } = await usuariosCollection.insertOne({
        name: user.name,
        email: user.email,
        created_at: date,
        proyectos: [],
      });

      return new Response(
        JSON.stringify({
          id: insertedId,
          name: user.name,
          email: user.email,
          created_at: date,
        }),
        { status: 201 },
      );
    } else if (path === "/projects") {
      const project = await req.json();
      const date = new Date();

      if (!project.name || !project.start_date || !project.user_id) {
        return new Response(
          "Bad request: name, stard_date and user_id are required",
          {
            status: 400,
          },
        );
      }

      const { insertedId } = await proyectosCollection.insertOne({
        name: project.name,
        description: project.description,
        start_date: date,
        end_date: date || "null",
        tareas: [],
        user_id: project.user_id,
      });

      return new Response(
        JSON.stringify({
          id: insertedId,
          name: project.name,
          description: project.description,
          start_date: date,
          end_date: date || "null",
          user_id: project.user_id,
        }),
        { status: 201 },
      );
    } else if (path === "/tasks") {
      const tasks = await req.json();
      const date = new Date();

      if (!tasks.title || !tasks.project_id) {
        return new Response("Bad request: title and project_id are required", {
          status: 404,
        });
      }

      const { insertedId } = await tareasCollection.insertOne({
        title: tasks.title,
        description: tasks.description,
        status: tasks.status || "pending",
        created_at: date,
        due_date: date,
        project_id: tasks.project_id,
      });

      return new Response(
        JSON.stringify({
          id: insertedId,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status || "pending",
          created_at: date,
          due_date: date,
          project_id: tasks.project_id,
        }),
        { status: 201 },
      );
    } else if (path === "/tasks/move") {
      try {
        const { task_id, destination_project_id } = await req.json();

        if (!task_id || !destination_project_id) {
          return new Response(
            JSON.stringify({
              message: "task_id and destination_project_id are required",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const taskId = new ObjectId(task_id);
        const destinationProjectId = new ObjectId(destination_project_id);

        const updatedTask = await moveTaskEntreProjects(
          taskId,
          destinationProjectId,
          tareasCollection,
        );

        if (!updatedTask) {
          return new Response(
            JSON.stringify({ message: "Failed to move the task" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            message: "Task moved successfully.",
            task: {
              id: updatedTask._id!.toString(),
              title: updatedTask.title,
              project_id: updatedTask.project_id.toString(),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            message: "Internal server error",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  } else if (method === "DELETE") {
    if (path === "/users") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response("Bad request, user id is required", {
          status: 400,
        });
      }

      const { deletedCount } = await usuariosCollection.deleteOne(
        { _id: new ObjectId(id) },
      );

      if (deletedCount === 0) {
        return new Response("User not found", { status: 404 });
      }

      return new Response("User deleted successfully", { status: 200 });
    } else if (path === "/projects") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response("Bad request: project id is required", {
          status: 400,
        });
      }

      const { deletedCount } = await proyectosCollection.deleteOne(
        { _id: new ObjectId(id) },
      );

      if (deletedCount === 0) {
        return new Response("Project not found", { status: 404 });
      }

      return new Response("Project deleted successfully", { status: 200 });
    } else if (path === "/tasks") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response("Bad request: task id is requires", {
          status: 400,
        });
      }

      const { deletedCount } = await tareasCollection.deleteOne(
        { _id: new ObjectId(id) },
      );

      if (deletedCount === 0) {
        return new Response("Task not found", { status: 404 });
      }

      return new Response("Task deleted successfully", { status: 200 });
    }
  }

  return new Response("Endpoint not found", { status: 404 });
};

Deno.serve({ port: 3000 }, handler);
