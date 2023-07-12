/* 
------------PLAN D'ACTION POUR CE ROBOT DE MAITRE AMAURY------------
- Créer un objet dans lequel ranger mes données ✅
- Récupérer le nom et id du game dans MongoDB ✅
- Récupérer les donées sur Steam et créé une nouvelle collection SteamGame avec le mm id que pour la collection Game ✅
- Stocker mon objet en base de donnée Mongo : SteamGame ✅
- Edit de la DB et pas ajout systémqtique ✅
- le robot se lance chaque lundi matin à 00:01 ❌
--------------------------------------------------------------------
*/
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

//Je crée un schéma pour récupérer mes games dans la collection game de MongoDB
const GameSchema = new mongoose.Schema({
  _id: String,
  name: String,
});

//Je crée le model pour les games de la collection game de MongoDB
const GameModel = mongoose.model("Game", GameSchema);

//Je crée un schéma pour les gameSteam de la collection SteamGame de MongoDb
const GameSteamSchema = new mongoose.Schema({
  idGame: String,
  name: String,
  appid: String,
  type: String,
  requiredAge: Number,
  isFree: Boolean,
  supportedLanguage: String,
  headerImage: String,
  aboutTheGame: String,
  developers: [],
  publishers: [],
  genres: [],
  categories: [],
  price: String,
});

//Je crée le model pour les gameSteam de la collection SteamGame de MongoDb
const GameSteamModel = mongoose.model("SteamGame", GameSteamSchema);

//Méthode qui cherche les games de mongo et qui va requête l'api Steam pour ma collection SteamGame
async function fetchGameSteam() {
  const startTime = Date.now();

  //Je récupère la liste de tous les jeux de Steam
  const steamGamesAll = await getAllGameWithSteam();
  try {
    const games = await GameModel.find().exec();

    let count = 0;

    let timeout = setInterval(async () => {
      const gameRecover = games[count];

      //Je parcours la liste récupérer avec GetAllGames de Steam
      for (let i = 0; i < steamGamesAll.applist.apps.length; i++) {
        //Je tcheck de savoir si le nom match
        if (gameRecover.name == steamGamesAll.applist.apps[i].name) {
          let currentGameSteam = {
            idGame: gameRecover._id,
            name: steamGamesAll.applist.apps[i].name,
            appid: steamGamesAll.applist.apps[i].appid,
            type: "",
            requiredAge: 0,
            isFree: false,
            supportedLanguage: "unknown",
            headerImage: "",
            aboutTheGame: "",
            developers: [] as string[],
            publishers: [] as string[],
            categories: [] as string[],
            genres: [] as string[],
            price: "",
          };
          await updateCurrentGameSteamWithSteam(currentGameSteam);
        }
      }

      if (++count === games.length) {
        //++count on ajoute 1 à count puis on vérif l'égalité. Si count ++ alors on vérifie d'abord l'égalité puis on ajoute
        clearInterval(timeout);
        console.log("interval cleared");
        mongoose.disconnect();
        console.log("On ferme MongoDB à clef svp");
        const endTime = Date.now();
        calculateExecutionTime(startTime, endTime);
      }
    }, 1000 /* 6000 */); // 1 seconde d'attente
  } catch (error) {
    console.log(" catch dans le fetch : " + error);
  }
}

async function updateCurrentGameSteamWithSteam(currentGamesSteam: any) {
  const oneGameSteam = await getOneGameSteam(currentGamesSteam);
  for (const appIdKey in oneGameSteam) {
    if (oneGameSteam.hasOwnProperty(appIdKey)) {
      const oneGame = oneGameSteam[appIdKey];
      if (oneGame.success == true) {
        const {
          type,
          required_age,
          is_free,
          supported_languages,
          header_image,
          about_the_game,
          price_overview,
          developers,
          publishers,
          genres,
          categories,
        } = oneGame.data;

        if (type !== undefined) {
          currentGamesSteam.type = type;
        }
        if (required_age !== undefined) {
          currentGamesSteam.requiredAge = required_age;
        }
        if (is_free !== undefined) {
          currentGamesSteam.isFree = is_free;
        }
        if (supported_languages !== undefined) {
          currentGamesSteam.supportedLanguage = supported_languages;
        }
        if (header_image !== undefined) {
          currentGamesSteam.headerImage = header_image;
        }
        if (about_the_game !== undefined) {
          currentGamesSteam.aboutTheGame = about_the_game;
        }
        if (price_overview !== undefined) {
          currentGamesSteam.price = price_overview.final_formatted;
        }
        if (developers !== undefined) {
          currentGamesSteam.developers = developers;
        }
        if (publishers !== undefined) {
          currentGamesSteam.publishers = publishers;
        }
        if (genres !== undefined) {
          currentGamesSteam.genres = genres.map(
            (genre: any) => genre.description
          );
        }
        if (categories !== undefined) {
          currentGamesSteam.categories = categories.map(
            (category: any) => category.description
          );
        }

        let existingGameSteam = await GameSteamModel.findOne({
          name: currentGamesSteam.name,
        });

        if (existingGameSteam) {
          existingGameSteam.type = currentGamesSteam.type;
          existingGameSteam.requiredAge = currentGamesSteam.requiredAge;
          existingGameSteam.isFree = currentGamesSteam.isFree;
          existingGameSteam.supportedLanguage =
            currentGamesSteam.supportedLanguage;
          existingGameSteam.headerImage = currentGamesSteam.headerImage;
          existingGameSteam.aboutTheGame = currentGamesSteam.aboutTheGame;
          existingGameSteam.price = currentGamesSteam.price;
          existingGameSteam.developers = currentGamesSteam.developers;
          existingGameSteam.publishers = currentGamesSteam.publishers;
          existingGameSteam.genres = currentGamesSteam.genres;
          existingGameSteam.categories = currentGamesSteam.categories;

          try {
            await existingGameSteam.save();
          } catch (error) {
            console.log(
              "Une erreur s'est produite lors de la sauvegarde du jeu Steam DEJA EXISTANT et c'est clacké au sol : " +
                error
            );
          }
        } else {
          let newGameSteam = new GameSteamModel(currentGamesSteam);

          try {
            await newGameSteam.save();
          } catch (error) {
            console.log(
              "Une erreur s'est produite lors de la sauvegarde du NOUVEAU jeu Steam et c'est clacké au sol : " +
                error
            );
          }
        }
      }
    }
  }
}

async function getOneGameSteam(currentGamesSteam: any) {
  try {
    const url = `https://store.steampowered.com/api/appdetails/?appids=${currentGamesSteam.appid}`;

    //Utilise la requête et les autorisation
    const response = await fetch(url);

    return response.json();
  } catch (error) {
    console.log("error dans getOneSteam" + error);
  }
}

async function getAllGameWithSteam() {
  const url = "http://api.steampowered.com/ISteamApps/GetAppList/v2/";

  //Utilise la requête et les autorisation
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Response not OK ! Bolosse");
  }
  return response.json();
}

async function display() {
  //J'ouvre le flux vers mongoDB
  mongoose.connect(
    `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.MONGO_DB}`
  );
  console.log("Connexion à MongoDB avec le sourire !");
  await fetchGameSteam();
}

//Pour moi : pour savoir combien de temps ça met
function calculateExecutionTime(startTime: any, endTime: any) {
  const executionTime = endTime - startTime;
  const minutes = Math.floor(executionTime / 60000);
  const seconds = Math.floor((executionTime % 60000) / 1000);
  const milliseconds = executionTime % 1000;

  console.log(
    `Temps d'exécution : ${minutes} minutes, ${seconds} secondes et ${milliseconds} millisecondes`
  );
}

display();
