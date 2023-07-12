/* 
------------PLAN D'ACTION POUR CE ROBOT DE MAITRE AMAURY------------
- Créer un objet dans lequel ranger mes données ✅
- Récupérer les donées et les ranger dans mon objet ✅
- Stocker mon objet en base de donnée Mongo ✅
- Edit de la DB et pas ajout systémqtique ✅
- Jeux complet ! ✅ 
- le robot se lance tous les jours à 21h ❌
--------------------------------------------------------------------
*/
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

//Objet Streams pour le Game
class Stream {
  constructor(
    public streamer: string,
    public title: string,
    public language: string,
    public viewerCount: Number
  ) {}
}

//Je crée un schéma pour mon Streams
const streamsSchema = new mongoose.Schema({
  streamer: String,
  title: String,
  language: String,
  viewerCount: Number,
});

//Objet pour l'historique des viewers
class ViewerByDate {
  constructor(public date: Date, public viewers: Number) {}
}

//Je crée un schéma pour mon historique de viewer
const ViewerHistorySchema = new mongoose.Schema({
  date: Date,
  viewers: Number,
});

//Je crée un schéma pour mon game
const gameSchema = new mongoose.Schema({
  //INFO get TopGames Twitch
  _id: String,
  name: String,
  firstDayInTop: Date,
  viewersDay: Number,
  igdbId: String,
  //INFO get Games Igdb
  cover: String,
  firstReleaseDate: Date,
  genres: [],
  summary: String,
  platforms: [],
  involvedCompanies: [],
  streams: [streamsSchema],
  viewerHistory: [ViewerHistorySchema],
});

//Je crée mon Model mon mon Game
const GameModel = mongoose.model("Game", gameSchema);

//Méthode qui cherche mes Games et qui les enregistre sur MongoDB
async function fetchGame() {
  //Requête Get TopGames API Twitch
  const urlGetTopGames = "https://api.twitch.tv/helix/games/top";
  try {
    let url = urlGetTopGames;
    await buildingGames(url);
  } catch (error) {
    console.log("erreur dans le fetch : " + error);
  }
}

//Méthode pour les autorisation d'identification pour Twitch
async function sendTwitchRequest(url: any) {
  //Token pour l'API Twhitch et IGDB
  const authorization = "Bearer 7tb61t29r3fhaft6ux6hh64fr1sf6v";
  const clientId = "7xereixlp03cyd9lsebf4om6rensrb";

  const headers = new Headers();
  headers.append("Authorization", authorization);
  headers.append("Client-Id", clientId);

  //Utilise la requête et les autorisation
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("Response not OK !");
  }
  return response.json();
}

//Méthode pour passer dans chacune des pages et à chaque fois créer un game pour chacun des objets
async function buildingGames(url: any) {
  try {
    //boucle : pour parcourir les pages de résultats TANT QUE url!=null
    while (url) {
      const gameTopGame = await sendTwitchRequest(url);
      await processGameTopGame(gameTopGame);
      url = getNextPageUrl(gameTopGame, url);
    }
  } catch (error) {
    console.log(
      "Ton Game Top il est pas ouf mais ça tu le sais (crash sur la derniere page mais osef): " +
        error
    );
  }
}

//Méthode pour créer mon game en passant par chacune des requête
//La première des requête est GET TopGames
async function processGameTopGame(gameTopGame: any) {
  for (let i = 0; i < gameTopGame.data.length; i++) {
    //J'exclue tous les TopGame qui ne sont pas des games comme JustChatting par exemple
    if (gameTopGame.data[i].igdb_id !== "") {
      const currentGame = await createCurrentGame(gameTopGame.data[i]);
      await updateCurrentGameWithIgdbData(currentGame);
      await updateCurrentGameWithStreams(currentGame);
      await updateGame(currentGame);
    }
  }
}

//Je crée mon currentGame avec d'abord les gameData qui vienne de ma requête Get TopGame
async function createCurrentGame(gameData: any) {
  const currentGame = {
    id: gameData.id,
    name: gameData.name,
    firstDayInTop: new Date(),
    viewersDay: 0,
    igdbId: gameData.igdb_id,
    summary: "",
    cover: "",
    genres: [] as string[],
    platforms: [] as string[],
    involvedCompanies: [] as string[],
    firstReleaseDate: new Date(1972, 5, 18), //1972 : premier jv et 18/05 mon anniversaire. Des bisous !
    streams: [] as Stream[],
    viewerByDate: ViewerByDate,
  };
  return currentGame;
}

//Méthode pour la requete Get Game API Igdb
async function updateCurrentGameWithIgdbData(currentGame: any) {
  const urlIgdb = `https://api.igdb.com/v4/games/${currentGame.igdbId}?fields=name,summary,genres.name,platforms.name,cover.image_id,first_release_date,involved_companies.company.name`;
  const gameIgdb = await sendTwitchRequest(urlIgdb);

  //Je récupère les données des games et les stocks dans le currentGame
  //Pour gérer lors qu'il n'y pas de firstReleaseDate - je fais la meme pour les autres ensuite
  if (gameIgdb[0].first_release_date != undefined)
    currentGame.firstReleaseDate = convertUnixEpochToDate(
      gameIgdb[0].first_release_date
    );
  if (gameIgdb[0].cover != undefined)
    currentGame.cover =
      "https://images.igdb.com/igdb/image/upload/t_cover_big/" +
      gameIgdb[0].cover.image_id +
      ".png";
  //Toutes les données avec les tableaux : genres / platforms / incolvedCompanies
  if (gameIgdb[0].genres != undefined)
    for (let i = 0; i < gameIgdb[0].genres.length; i++) {
      currentGame.genres.push(gameIgdb[0].genres[i].name);
    }
  if (gameIgdb[0].platforms != undefined)
    for (let i = 0; i < gameIgdb[0].platforms.length; i++) {
      currentGame.platforms.push(gameIgdb[0].platforms[i].name);
    }
  if (gameIgdb[0].involved_companies != undefined)
    for (let i = 0; i < gameIgdb[0].involved_companies.length; i++) {
      currentGame.involvedCompanies.push(
        gameIgdb[0].involved_companies[i].name
      );
    }
  currentGame.summary = gameIgdb[0].summary;
}

//Méthode pour la requete Get Stream API Twitch
async function updateCurrentGameWithStreams(currentGame: any) {
  const urlStreams = `https://api.twitch.tv/helix/streams?game_id=${currentGame.id}`;
  const gameStream = await sendTwitchRequest(urlStreams);
  //Toutes les données pour les Streams
  let totalViewer = 0;
  for (let i = 0; i < gameStream.data.length; i++) {
    const currentStream = new Stream(
      gameStream.data[i].user_name,
      gameStream.data[i].title,
      gameStream.data[i].language,
      gameStream.data[i].viewer_count
    );
    totalViewer += gameStream.data[i].viewer_count;
    currentGame.streams.push(currentStream);
  }
  currentGame.viewersDay = totalViewer;
  currentGame.viewerByDate = new ViewerByDate(new Date(), totalViewer);
}

//Méthode pour mettre à jour l'url de la page pour la boucle
function getNextPageUrl(gameTopGame: any, url: any) {
  return gameTopGame.pagination.cursor !== null
    ? `${url}?first=100&after=${gameTopGame.pagination.cursor}`
    : "";
}

//Méthode pour update ma database avec mon currentGame
async function updateGame(gameData: any) {
  const {
    id,
    name,
    firstDayInTop,
    viewersDay,
    igdbId,
    cover,
    summary,
    firstReleaseDate,
    genres,
    platforms,
    involvedCompanies,
    streams,
    viewerByDate,
  } = gameData;

  try {
    //Recherche du game existant avec l'ID actuel
    const existingGame = await GameModel.findById(id);

    if (existingGame) {
      //Je vérifie si la donnée à changer et la modif que si elle a changé
      //En vrai c'est nulle ! Va falloir trouver autre chose de mieux
      if (existingGame.name !== name) existingGame.name = name;
      if (existingGame.igdbId !== igdbId) existingGame.igdbId = igdbId;
      if (existingGame.cover !== cover) existingGame.cover = cover;
      if (existingGame.firstReleaseDate !== firstReleaseDate)
        existingGame.firstReleaseDate = firstReleaseDate;
      if (existingGame.genres !== genres) existingGame.genres = genres;
      if (existingGame.platforms !== platforms)
        existingGame.platforms = platforms;
      if (existingGame.involvedCompanies !== involvedCompanies)
        existingGame.involvedCompanies = involvedCompanies;
      if (existingGame.summary !== summary) existingGame.summary = summary;
      existingGame.streams = streams;
      existingGame.viewersDay = viewersDay;
      existingGame.viewerHistory.push(viewerByDate);

      await existingGame.save();
    } else {
      //Le game n'existe pas donc création d'un nouveau
      let newGame = new GameModel({
        _id: id,
        name,
        firstDayInTop,
        viewersDay,
        igdbId,
        cover,
        firstReleaseDate,
        genres,
        platforms,
        involvedCompanies,
        summary,
        streams,
        viewerHistory: [],
      });

      newGame.viewerHistory.push(viewerByDate);
      await newGame.save();
    }
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du game :", error);
  }
}

//Méthode pour convertire ma donné récupéré en unix Epoch en une date
function convertUnixEpochToDate(unixEpoch: any) {
  const milliseconds = unixEpoch * 1000;
  const date = new Date(milliseconds);

  return date;
}

async function display() {
  const startTime = Date.now();
  //J'ouvre le flux vers mongoDB et je remplis la db
  mongoose.connect(
    `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.MONGO_DB}`
  );
  console.log("Connexion à MongoDB avec le sourire !");
  await fetchGame();
  mongoose.disconnect();
  console.log("On ferme MongoDB à clef svp");

  const endTime = Date.now();
  calculateExecutionTime(startTime, endTime);
}

//Pour moi : pour savoir combien de temps ça met
function calculateExecutionTime(startTime: any, endTime: any) {
  const executionTime = endTime - startTime;
  const minutes = Math.floor(executionTime / 60000);
  const seconds = Math.floor((executionTime % 60000) / 1000);
  const milliseconds = executionTime % 1000;

  console.log(
    `Temps d'exécution du magnifique Robossein: ${minutes} minutes, ${seconds} secondes et ${milliseconds} millisecondes`
  );
}

display();
