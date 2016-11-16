# MicroSPAT

## Introduction
MicroSPAT is a collection of tools for semi-automated analysis of raw capillary electrophoresis (CE) data output by the ABI 3730. MicroSPAT integrates several features including a plate view for quality checking, automated ladder identification, sample based association of FSA data to keep data organized in a logical manner, automated bin generation using a clustering algorithm, automated artifact estimator generation, automated quantification bias estimation, and automated genotyping of samples with the option of manual curation.

## DEV WARNING
Under Very Heavy Development -- Features will change, things WILL break

## Installation
<<<<<<< HEAD
Download the latest build zip, unzip, and navigate to the folder.  Using either pip or conda, install the required packages either through requirements.txt or using the conda environment manager and the environment.yml file.

```
pip install -r requirements.txt
```

### conda
```
conda env create -f environment.yml
source activate microspat
```

If you plan to install through pip, I highly suggest using an environment manager, but this is beyond the scope of this tutorial. Once all packages are installed, execute the following
=======
Download the latest build zip, unzip, and navigate to the folder.  Using either pip or conda, install the required packages either through requirements.txt or using the conda environment manager and the environment.yml file.  If you plan to install through pip, I highly suggest using an environment manager, but this is beyond the scope of this tutorial. Once all packages are installed, execute the following
>>>>>>> master

```
python manage.py initDB
```

This initializes the application with the HDROX400 Ladder

## Running
While in the MicroSPAT directory, execute the following

```
python manage.py runsockets
```

Then open Chrome (Only tested in Chrome to date, no guarantee for other browsers at this time) and navigate to:
```
http://localhost:5000
```

This will bring up MicroSPAT for the first time.  At this point, you can then start to populate the application with your data.
