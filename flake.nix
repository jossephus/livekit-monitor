{
  description = "LiveKit monitor with Rust/Node dev shell and Docker image";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    rust-overlay,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [rust-overlay.overlays.default];
      pkgs = import nixpkgs {
        inherit system overlays;
      };

      rustToolchain = pkgs.rust-bin.stable.latest.default;

      # Linux pkgs for cross-compiling the Docker image
      linuxSystem =
        if system == "aarch64-darwin"
        then "aarch64-linux"
        else if system == "x86_64-darwin"
        then "x86_64-linux"
        else system;
      linuxPkgs = import nixpkgs {
        system = linuxSystem;
        inherit overlays;
      };
      cleanSrc = pkgs.lib.cleanSourceWith {
        src = ./.;
        filter = path: type:
          let
            baseName = builtins.baseNameOf path;
          in
            baseName != "target"
            && baseName != "node_modules"
            && baseName != ".git"
            && baseName != ".npm"
            && baseName != "data"
            && baseName != ".agents"
            && !pkgs.lib.hasSuffix ".png" baseName;
      };

      # Build frontend with a given BASE_PATH
      mkFrontendDist = basePath: pkgs.buildNpmPackage {
        pname = "livekit-monitor-frontend";
        version = "0.1.0";
        src = ./frontend;
        npmDepsHash = "sha256-0iipMhang1Vnnm9aqsy1VxLm/Hjj6/5aA96bFNDojxE=";
        env.BASE_PATH = basePath;
        installPhase = ''
          mkdir -p $out
          cp -r dist/* $out/
        '';
      };

      # Build the Rust binary with the given frontend dist
      mkMonitorWithFrontend = buildPkgs: frontend:
        buildPkgs.rustPlatform.buildRustPackage {
          pname = "livekit-monitor";
          version = "0.1.0";
          src = cleanSrc;
          cargoLock.lockFile = ./Cargo.lock;
          nativeBuildInputs = [buildPkgs.rust-bin.stable.latest.default buildPkgs.pkg-config];
          buildInputs = [buildPkgs.openssl];

          preBuild = ''
            mkdir -p frontend/dist
            cp -r ${frontend}/* frontend/dist/
          '';
        };

      # Default (root deployment): base="/"
      frontendDist = mkFrontendDist "";
      monitor = mkMonitorWithFrontend linuxPkgs frontendDist;

      # Subpath deployment: base="/livekit-monitor/"
      frontendDistSubpath = mkFrontendDist "/livekit-monitor";
      monitorSubpath = mkMonitorWithFrontend linuxPkgs frontendDistSubpath;

      mkDockerImage = name: tag: monitorBin: linuxPkgs.dockerTools.buildLayeredImage {
        inherit name tag;

        contents = [
          monitorBin
          linuxPkgs.cacert
          linuxPkgs.iana-etc
        ];

        config = {
          Cmd = ["/bin/livekit-monitor"];
          Env = [
            "PORT=3000"
            "SQLITE_PATH=/data/monitor.db"
          ];
          ExposedPorts = {
            "3000/tcp" = {};
          };
          Volumes = {
            "/data" = {};
          };
        };
      };

      dockerImage = mkDockerImage "livekit-monitor" "latest" monitor;
      dockerImageSubpath = mkDockerImage "livekit-monitor" "subpath" monitorSubpath;
    in {
      packages = {
        default = monitor;
        subpath = monitorSubpath;
        docker = dockerImage;
        docker-subpath = dockerImageSubpath;
      };

      devShells.default = pkgs.mkShell {
        packages = [
          rustToolchain
          pkgs.pkg-config
          pkgs.openssl
          pkgs.nodejs_20
        ];

        shellHook = ''
          export RUST_BACKTRACE=1
          export PATH="$PWD/frontend/node_modules/.bin:$PATH"
        '';
      };
    });
}
