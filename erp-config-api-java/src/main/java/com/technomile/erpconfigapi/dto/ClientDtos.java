package com.technomile.erpconfigapi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

public class ClientDtos {
    public record ClientCreateDto(
            @NotBlank @Size(max = 50) String client_id,
            @NotBlank @Size(max = 200) String client_name,
            Boolean is_active
    ) {
    }

    public record ClientUpdateDto(
            @Size(max = 200) String client_name,
            Boolean is_active
    ) {
    }

    public record ClientReadDto(
            String client_id,
            String client_name,
            Boolean is_active,
            OffsetDateTime created_at
    ) {
    }
}
