package com.technomile.erpconfigapi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

public class PipelineDtos {
    public record PipelineCreateDto(
            @NotBlank @Size(max = 100) String pipeline_id,
            @NotBlank @Size(max = 50) String client_id,
            @Size(max = 20) String version,
            @NotBlank @Size(max = 50) String source_system,
            @NotBlank @Size(max = 100) String object_type,
            @Size(max = 50) String event_type,
            @NotBlank @Size(max = 10) String pattern_id,
            @Size(max = 20) String status,
            Integer retry_max_attempts,
            @Size(max = 20) String retry_backoff,
            Integer retry_backoff_base_ms,
            @Size(max = 100) String retry_on_status_codes
    ) {
    }

    public record PipelineUpdateDto(
            @Size(max = 20) String version,
            @Size(max = 50) String source_system,
            @Size(max = 100) String object_type,
            @Size(max = 50) String event_type,
            @Size(max = 10) String pattern_id,
            @Size(max = 20) String status,
            Integer retry_max_attempts,
            @Size(max = 20) String retry_backoff,
            Integer retry_backoff_base_ms,
            @Size(max = 100) String retry_on_status_codes
    ) {
    }

    public record PipelineReadDto(
            String pipeline_id,
            String client_id,
            String version,
            String source_system,
            String object_type,
            String event_type,
            String pattern_id,
            String status,
            Integer retry_max_attempts,
            String retry_backoff,
            Integer retry_backoff_base_ms,
            String retry_on_status_codes,
            OffsetDateTime created_at,
            OffsetDateTime updated_at
    ) {
    }
}
