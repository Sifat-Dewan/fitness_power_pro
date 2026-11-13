import { config } from "dotenv";
config({path:".env.local",override:true});
async function main(){
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
 const [{db},{settings}]=await Promise.all([import("../src/db"),import("../src/db/schema")]);
 await db.insert(settings).values({id:"main",gymName:"Fitness Power",currency:"BDT",timezone:"Asia/Dhaka"}).onConflictDoNothing();
 console.log("Gym settings initialized. No fictional plans, lockers, members or transactions were created.");
 process.exit(0);
}
main().catch(error=>{console.error(error);process.exit(1)});
